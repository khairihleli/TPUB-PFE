package com.example.zelqanepfe.service.ai.learning;

import com.example.zelqanepfe.dto.AiFeedbackResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.AiContentCheck;
import com.example.zelqanepfe.model.AiDecisionLog;
import com.example.zelqanepfe.model.AiFeedback;
import com.example.zelqanepfe.model.AiFeedbackOutcome;
import com.example.zelqanepfe.model.AiMatchedRule;
import com.example.zelqanepfe.repository.AiDecisionLogRepository;
import com.example.zelqanepfe.repository.AiFeedbackRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Builds {@code ai_feedback} rows from persisted administrator decisions only (docs/round2-contract.md §1.4, §2.6)
 * and serves {@code GET /api/ai/feedback}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiFeedbackService {

    static final int MAX_PAGE_SIZE = 100;

    private final AiDecisionLogRepository decisionLogRepository;
    private final AiFeedbackRepository feedbackRepository;
    private final Clock clock;

    /** Idempotent: every ADMIN decision log without feedback gets exactly one row. Returns the number created. */
    @Transactional
    public int sync() {
        List<AiDecisionLog> pending = decisionLogRepository.findAdminDecisionsWithoutFeedback();
        for (AiDecisionLog decision : pending) {
            feedbackRepository.save(fromDecision(decision));
        }
        if (!pending.isEmpty()) {
            log.info("Retours IA synchronisés : {} nouvelle(s) décision(s) administrateur", pending.size());
        }
        return pending.size();
    }

    static AiFeedback fromDecision(AiDecisionLog decision) {
        AiContentCheck check = decision.getCheck();
        return AiFeedback.builder()
                .decisionLog(decision)
                .campaign(decision.getCampaign())
                .check(check)
                .aiStatus(check.getAiStatus())
                .adminDecision(decision.getDecision())
                .outcome(CalibrationMath.outcome(check.getAiStatus(), decision.getDecision()))
                .riskScore(check.getRiskScore() == null ? 0 : check.getRiskScore())
                .qualityScore(check.getQualityScore() == null ? 0 : check.getQualityScore())
                .matchedRuleIds(new java.util.ArrayList<>(ruleIds(check)))
                .calibrationVersion(check.getCalibrationVersion())
                .decidedByUser(decision.getDecidedByUser())
                .createdAt(decision.getCreatedAt() != null ? decision.getCreatedAt() : Instant.now())
                .build();
    }

    static List<Long> ruleIds(AiContentCheck check) {
        if (check.getMatchedRules() == null) {
            return List.of();
        }
        return check.getMatchedRules().stream().map(AiMatchedRule::getRuleId).filter(Objects::nonNull).distinct().toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<AiFeedbackResponse> search(Collection<AiFeedbackOutcome> outcomes, Long ruleId, LocalDate from,
                                                   LocalDate to, int page, int size) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_RANGE", "La date de fin précède la date de début.");
        }
        Instant start = from == null ? null : from.atStartOfDay(clock.getZone()).toInstant();
        Instant end = to == null ? null : to.plusDays(1).atStartOfDay(clock.getZone()).toInstant();
        List<AiFeedback> rows = feedbackRepository.findAll().stream()
                .filter(f -> outcomes == null || outcomes.isEmpty() || outcomes.contains(f.getOutcome()))
                .filter(f -> ruleId == null || matchedRuleIds(f).contains(ruleId))
                .filter(f -> start == null || !f.getCreatedAt().isBefore(start))
                .filter(f -> end == null || f.getCreatedAt().isBefore(end))
                .sorted(Comparator.comparing(AiFeedback::getCreatedAt).thenComparing(AiFeedback::getId).reversed())
                .toList();
        int pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, size));
        int pageIndex = Math.max(0, page);
        int fromIndex = Math.min(rows.size(), pageIndex * pageSize);
        int toIndex = Math.min(rows.size(), fromIndex + pageSize);
        return PageResponse.<AiFeedbackResponse>builder()
                .items(rows.subList(fromIndex, toIndex).stream().map(AiFeedbackService::toResponse).toList())
                .page(pageIndex)
                .size(pageSize)
                .totalItems(rows.size())
                .totalPages((int) Math.ceil((double) rows.size() / pageSize))
                .build();
    }

    /** Rule ids as {@code Long}, whatever numeric type the JSON mapping produced. */
    public static List<Long> matchedRuleIds(AiFeedback feedback) {
        List<?> raw = feedback.getMatchedRuleIds();
        if (raw == null) {
            return List.of();
        }
        return raw.stream().filter(Number.class::isInstance).map(o -> ((Number) o).longValue()).distinct().toList();
    }

    static AiFeedbackResponse toResponse(AiFeedback f) {
        return AiFeedbackResponse.builder()
                .id(f.getId())
                .campaignId(f.getCampaign().getId())
                .campaignName(f.getCampaign().getName())
                .checkId(f.getCheck() != null ? f.getCheck().getId() : null)
                .decisionLogId(f.getDecisionLog().getId())
                .aiStatus(f.getAiStatus().name())
                .adminDecision(f.getAdminDecision())
                .outcome(f.getOutcome().name())
                .riskScore(f.getRiskScore() == null ? 0 : f.getRiskScore())
                .qualityScore(f.getQualityScore() == null ? 0 : f.getQualityScore())
                .matchedRuleIds(matchedRuleIds(f))
                .calibrationVersion(f.getCalibrationVersion())
                .decidedByName(f.getDecidedByUser() != null ? f.getDecidedByUser().getNom() : null)
                .createdAt(f.getCreatedAt())
                .build();
    }
}
