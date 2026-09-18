package com.example.zelqanepfe.service.ai.learning;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.dto.AiCalibrationResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.AiCalibration;
import com.example.zelqanepfe.model.AiFeedback;
import com.example.zelqanepfe.model.AiModerationRule;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.AiCalibrationRepository;
import com.example.zelqanepfe.repository.AiFeedbackRepository;
import com.example.zelqanepfe.repository.AiModerationRuleRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.service.AuditService;
import com.example.zelqanepfe.service.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Versioned calibration of the AI thresholds and rule weights (docs/round2-contract.md §2.6): active snapshot for
 * each analysis, recalibration from recent feedback, manual activation of a version.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiCalibrationService {

    static final int HISTORY_LIMIT = 50;

    private final AiCalibrationRepository calibrationRepository;
    private final AiFeedbackRepository feedbackRepository;
    private final AiModerationRuleRepository ruleRepository;
    private final UserRepository userRepository;
    private final AiFeedbackService feedbackService;
    private final AiAnalysisProperties properties;
    private final AuditService auditService;
    private final Clock clock;

    /** Thresholds and weights of the active version (version 1 is created when the table is empty, e.g. on H2). */
    @Transactional
    public CalibrationSnapshot activeSnapshot() {
        AiCalibration active = ensureActive();
        return active == null ? CalibrationSnapshot.DEFAULT : snapshot(active);
    }

    @Transactional
    public AiCalibrationResponse activeResponse() {
        AiCalibration active = ensureActive();
        return active == null ? null : toResponse(active, ruleNames());
    }

    @Transactional
    public List<AiCalibrationResponse> history() {
        ensureActive();
        Map<Long, String> names = ruleNames();
        return calibrationRepository.findTop50ByOrderByVersionDesc().stream()
                .limit(HISTORY_LIMIT)
                .map(c -> toResponse(c, names))
                .toList();
    }

    /**
     * Syncs feedback, computes a new version from the last {@code window-days} and stores it. With
     * {@code auto-apply} and a change, the new version replaces the active one in the same transaction.
     */
    @Transactional
    public AiCalibrationResponse recalibrate(AiCalibration.Trigger trigger) {
        feedbackService.sync();
        List<AiCalibration> locked = calibrationRepository.lockActive();
        AiCalibration previous = locked.isEmpty() ? ensureActive() : locked.get(0);
        int previousApprove = previous == null ? CalibrationMath.A0 : previous.getApproveThreshold();
        int previousReject = previous == null ? CalibrationMath.R0 : previous.getRejectThreshold();
        Map<Long, Double> previousWeights = previous == null ? Map.of() : weights(previous);

        AiAnalysisProperties.Learning learning = properties.getLearning();
        Instant since = Instant.now(clock).minus(Math.max(1, learning.getWindowDays()), ChronoUnit.DAYS);
        List<CalibrationMath.Sample> samples = feedbackRepository.findByCreatedAtGreaterThanEqual(since).stream()
                .map(AiCalibrationService::sample)
                .toList();
        CalibrationMath.Result result = CalibrationMath.compute(samples, previousApprove, previousReject, previousWeights,
                learning.getMinFeedback(), learning.getMinRuleSupport());

        boolean changed = previous == null
                || result.approveThreshold() != previousApprove
                || result.rejectThreshold() != previousReject
                || !CalibrationMath.sameWeights(result.ruleWeights(), previousWeights);
        boolean activate = learning.isAutoApply() && changed;

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("falsePositiveRate", result.falsePositiveRate());
        metrics.put("falseNegativeRate", result.falseNegativeRate());
        metrics.put("reviewedCount", result.reviewed());
        metrics.put("reviewedRejectedShare", result.reviewedRejectedShare());
        metrics.put("windowDays", learning.getWindowDays());
        metrics.put("minFeedback", learning.getMinFeedback());
        metrics.put("autoApplied", activate);

        if (activate && previous != null) {
            previous.setIsActive(false);
            calibrationRepository.saveAndFlush(previous);
        }
        Map<String, Double> storedWeights = new TreeMap<>();
        result.ruleWeights().forEach((id, w) -> storedWeights.put(String.valueOf(id), w));
        AiCalibration created = calibrationRepository.saveAndFlush(AiCalibration.builder()
                .version(calibrationRepository.maxVersion() + 1)
                .isActive(activate || previous == null)
                .triggerType(trigger)
                .changed(changed)
                .approveThreshold((short) result.approveThreshold())
                .rejectThreshold((short) result.rejectThreshold())
                .ruleWeights(new LinkedHashMap<>(storedWeights))
                .feedbackCount(result.feedbackCount())
                .falsePositiveCount(result.falsePositives())
                .falseNegativeCount(result.falseNegatives())
                .metrics(metrics)
                .createdByUser(currentUser())
                .build());
        log.info("Recalibration IA v{} ({}) : revue dès {}, refus au-delà de {}, {} retour(s){}", created.getVersion(),
                trigger, result.approveThreshold(), result.rejectThreshold(), result.feedbackCount(),
                created.getIsActive() ? ", version activée" : changed ? ", proposition non activée" : ", sans changement");
        if (trigger == AiCalibration.Trigger.MANUEL) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("approveThreshold", result.approveThreshold());
            details.put("rejectThreshold", result.rejectThreshold());
            details.put("changed", changed);
            details.put("active", created.getIsActive());
            details.put("feedbackCount", result.feedbackCount());
            auditService.record("AI_RECALIBRATED", "AI_CALIBRATION", created.getVersion(),
                    "Recalibration IA : version " + created.getVersion(), details);
        }
        return toResponse(created, ruleNames());
    }

    @Transactional
    public AiCalibrationResponse activate(int version) {
        AiCalibration target = calibrationRepository.findByVersion(version).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "CALIBRATION_NOT_FOUND", "Version de calibration introuvable."));
        List<AiCalibration> active = calibrationRepository.lockActive();
        Integer previousVersion = active.isEmpty() ? null : active.get(0).getVersion();
        for (AiCalibration calibration : active) {
            if (!calibration.getId().equals(target.getId())) {
                calibration.setIsActive(false);
                calibrationRepository.saveAndFlush(calibration);
            }
        }
        target.setIsActive(true);
        AiCalibration saved = calibrationRepository.saveAndFlush(target);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousVersion", previousVersion);
        details.put("approveThreshold", saved.getApproveThreshold());
        details.put("rejectThreshold", saved.getRejectThreshold());
        auditService.record("AI_CALIBRATION_ACTIVATED", "AI_CALIBRATION", saved.getVersion(),
                "Activation de la calibration IA version " + saved.getVersion(), details);
        return toResponse(saved, ruleNames());
    }

    /** Creates version 1 (INITIAL, 31/70) when no calibration exists; returns the active version or null. */
    AiCalibration ensureActive() {
        return calibrationRepository.findFirstByIsActiveTrueOrderByVersionDesc().orElseGet(() -> {
            if (calibrationRepository.count() > 0) {
                return null;
            }
            return calibrationRepository.saveAndFlush(AiCalibration.builder()
                    .version(1)
                    .isActive(true)
                    .triggerType(AiCalibration.Trigger.INITIAL)
                    .changed(false)
                    .approveThreshold((short) CalibrationMath.A0)
                    .rejectThreshold((short) CalibrationMath.R0)
                    .build());
        });
    }

    public static CalibrationSnapshot snapshot(AiCalibration calibration) {
        return new CalibrationSnapshot(calibration.getVersion(), calibration.getApproveThreshold(),
                calibration.getRejectThreshold(), weights(calibration));
    }

    /** Stored weights keyed by rule id (string keys and any numeric JSON type tolerated). */
    public static Map<Long, Double> weights(AiCalibration calibration) {
        Map<Long, Double> result = new TreeMap<>();
        Map<String, ?> raw = calibration.getRuleWeights();
        if (raw == null) {
            return result;
        }
        raw.forEach((key, value) -> {
            try {
                if (value instanceof Number number) {
                    result.put(Long.parseLong(key), number.doubleValue());
                }
            } catch (NumberFormatException ignored) {
                // Unknown key: not a rule id
            }
        });
        return result;
    }

    static CalibrationMath.Sample sample(AiFeedback feedback) {
        return new CalibrationMath.Sample(feedback.getOutcome(), feedback.getAiStatus(), feedback.getAdminDecision(),
                AiFeedbackService.matchedRuleIds(feedback));
    }

    Map<Long, String> ruleNames() {
        return ruleRepository.findAll().stream()
                .collect(Collectors.toMap(AiModerationRule::getId, AiModerationRule::getRuleName, (a, b) -> a));
    }

    static AiCalibrationResponse toResponse(AiCalibration c, Map<Long, String> ruleNames) {
        List<AiCalibrationResponse.RuleWeight> weights = weights(c).entrySet().stream()
                .map(e -> new AiCalibrationResponse.RuleWeight(e.getKey(), ruleNames.get(e.getKey()), e.getValue()))
                .sorted(Comparator.comparing(AiCalibrationResponse.RuleWeight::ruleId))
                .toList();
        return AiCalibrationResponse.builder()
                .version(c.getVersion())
                .active(Boolean.TRUE.equals(c.getIsActive()))
                .trigger(c.getTriggerType().name())
                .changed(Boolean.TRUE.equals(c.getChanged()))
                .approveThreshold(c.getApproveThreshold())
                .rejectThreshold(c.getRejectThreshold())
                .ruleWeights(weights)
                .feedbackCount(c.getFeedbackCount() == null ? 0 : c.getFeedbackCount())
                .falsePositives(c.getFalsePositiveCount() == null ? 0 : c.getFalsePositiveCount())
                .falseNegatives(c.getFalseNegativeCount() == null ? 0 : c.getFalseNegativeCount())
                .createdByName(c.getCreatedByUser() != null ? c.getCreatedByUser().getNom() : null)
                .createdAt(c.getCreatedAt())
                .build();
    }

    private User currentUser() {
        UserDetailsImpl principal = SecurityUtils.currentUserOrNull();
        return principal == null ? null : userRepository.findById(principal.getId()).orElse(null);
    }
}
