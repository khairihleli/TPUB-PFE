package com.example.tpubpfe.service.ai.learning;

import com.example.tpubpfe.dto.AiCalibrationResponse;
import com.example.tpubpfe.dto.AiQualityResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AiFeedback;
import com.example.tpubpfe.model.AiFeedbackOutcome;
import com.example.tpubpfe.model.AiMatchedRule;
import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.repository.AiFeedbackRepository;
import com.example.tpubpfe.repository.AiModerationRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** {@code GET /api/ai/quality}: AI error dashboard from administrator feedback (docs/round2-contract.md §2.7). */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiQualityService {

    static final int DEFAULT_DAYS = 90;
    static final int MAX_DAYS = 366;

    private final AiFeedbackService feedbackService;
    private final AiFeedbackRepository feedbackRepository;
    private final AiModerationRuleRepository ruleRepository;
    private final AiCalibrationService calibrationService;
    private final Clock clock;
    private final PlatformTransactionManager transactionManager;

    public AiQualityResponse quality(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock);
        LocalDate end = to == null ? today : to;
        LocalDate start = from == null ? end.minusDays(DEFAULT_DAYS - 1L) : from;
        if (end.isBefore(start) || ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_RANGE",
                    "La période doit être valide et ne pas dépasser 366 jours.");
        }
        try {
            feedbackService.sync();
        } catch (RuntimeException ex) {
            log.warn("Synchronisation des retours IA impossible : {}", ex.getMessage());
        }
        return new TransactionTemplate(transactionManager).execute(status -> load(start, end));
    }

    AiQualityResponse load(LocalDate start, LocalDate end) {
        ZoneId zone = clock.getZone();
        List<AiFeedback> feedback = feedbackRepository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                start.atStartOfDay(zone).toInstant(), end.plusDays(1).atStartOfDay(zone).toInstant());
        AiCalibrationResponse active = calibrationService.activeResponse();
        Map<Long, Double> weights = active == null ? Map.of() : active.getRuleWeights().stream()
                .collect(Collectors.toMap(AiCalibrationResponse.RuleWeight::ruleId, AiCalibrationResponse.RuleWeight::weight,
                        (a, b) -> a));
        List<Row> rows = feedback.stream().map(f -> toRow(f, zone)).toList();
        return compute(start, end, rows, ruleRepository.findAll(), weights, active);
    }

    /** Feedback reduced to what the dashboard needs. */
    public record Row(AiFeedbackOutcome outcome, String adminDecision, LocalDate date, List<Long> ruleIds,
                      List<AiMatchedRule> matchedRules) {
    }

    static Row toRow(AiFeedback f, ZoneId zone) {
        return new Row(f.getOutcome(), f.getAdminDecision(), f.getCreatedAt().atZone(zone).toLocalDate(),
                AiFeedbackService.matchedRuleIds(f),
                f.getCheck() != null && f.getCheck().getMatchedRules() != null ? f.getCheck().getMatchedRules() : List.of());
    }

    static AiQualityResponse compute(LocalDate from, LocalDate to, List<Row> rows, List<AiModerationRule> rules,
                                     Map<Long, Double> weights, AiCalibrationResponse active) {
        long ca = count(rows, AiFeedbackOutcome.CONFIRMED_APPROVAL);
        long fn = count(rows, AiFeedbackOutcome.FALSE_NEGATIVE);
        long fp = count(rows, AiFeedbackOutcome.FALSE_POSITIVE);
        long cf = count(rows, AiFeedbackOutcome.CONFIRMED_FLAG);
        long validations = rows.stream().filter(r -> isValidation(r.adminDecision())).count();
        long overrides = rows.stream().filter(r -> "VALIDATED_OVERRIDE".equals(r.adminDecision())).count();

        Map<Long, AiModerationRule> ruleById = rules.stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(AiModerationRule::getId, Function.identity(), (a, b) -> a));
        Map<Long, long[]> perRuleCounts = new LinkedHashMap<>();
        Map<Long, AiMatchedRule> seenRules = new LinkedHashMap<>();
        for (Row row : rows) {
            for (Long ruleId : row.ruleIds()) {
                long[] counts = perRuleCounts.computeIfAbsent(ruleId, id -> new long[2]);
                if ("REJECTED".equals(row.adminDecision())) {
                    counts[0]++;
                } else {
                    counts[1]++;
                }
            }
            for (AiMatchedRule matched : row.matchedRules()) {
                if (matched.getRuleId() != null) {
                    seenRules.putIfAbsent(matched.getRuleId(), matched);
                }
            }
        }
        List<AiQualityResponse.RuleQuality> perRule = new ArrayList<>();
        perRuleCounts.forEach((ruleId, counts) -> {
            AiModerationRule rule = ruleById.get(ruleId);
            AiMatchedRule seen = seenRules.get(ruleId);
            String name = rule != null ? rule.getRuleName() : seen != null ? seen.getRuleName() : "Règle #" + ruleId;
            AiModerationSeverity severity = rule != null && rule.getSeverity() != null ? rule.getSeverity()
                    : seen != null && seen.getSeverity() != null ? seen.getSeverity() : AiModerationSeverity.MEDIUM;
            long matches = counts[0] + counts[1];
            perRule.add(new AiQualityResponse.RuleQuality(ruleId, name, severity,
                    rule != null && Boolean.TRUE.equals(rule.getIsActive()), matches, counts[0], counts[1],
                    ratio(counts[0], matches), weights.getOrDefault(ruleId, 1d)));
        });
        perRule.sort(Comparator.comparingLong(AiQualityResponse.RuleQuality::matches).reversed()
                .thenComparing(AiQualityResponse.RuleQuality::ruleId));

        return AiQualityResponse.builder()
                .from(from)
                .to(to)
                .feedbackCount(rows.size())
                .confirmedApprovals(ca)
                .falseNegatives(fn)
                .falsePositives(fp)
                .confirmedFlags(cf)
                .falsePositiveRate(ratio(fp, fp + cf))
                .falseNegativeRate(ratio(fn, fn + ca))
                .accuracy(ratio(ca + cf, rows.size()))
                .overrideRate(ratio(overrides, validations))
                .perRule(perRule)
                .weekly(weekly(from, to, rows))
                .activeCalibration(active)
                .build();
    }

    /** ISO weeks (Monday) covering the period, zero-filled. */
    static List<AiQualityResponse.WeekRow> weekly(LocalDate from, LocalDate to, List<Row> rows) {
        LocalDate first = from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate last = to.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Map<LocalDate, long[]> weeks = new LinkedHashMap<>();
        for (LocalDate week = first; !week.isAfter(last); week = week.plusWeeks(1)) {
            weeks.put(week, new long[4]);
        }
        for (Row row : rows) {
            long[] counts = weeks.get(row.date().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
            if (counts == null) {
                continue;
            }
            counts[0]++;
            if (row.outcome() == AiFeedbackOutcome.FALSE_POSITIVE) {
                counts[1]++;
            }
            if (row.outcome() == AiFeedbackOutcome.FALSE_NEGATIVE) {
                counts[2]++;
            }
            if ("VALIDATED_OVERRIDE".equals(row.adminDecision())) {
                counts[3]++;
            }
        }
        return weeks.entrySet().stream()
                .map(e -> new AiQualityResponse.WeekRow(e.getKey(), e.getValue()[0], e.getValue()[1], e.getValue()[2],
                        e.getValue()[3]))
                .toList();
    }

    private static boolean isValidation(String decision) {
        return "VALIDATED".equals(decision) || "VALIDATED_OVERRIDE".equals(decision);
    }

    private static long count(List<Row> rows, AiFeedbackOutcome outcome) {
        return rows.stream().filter(r -> r.outcome() == outcome).count();
    }

    static Double ratio(long numerator, long denominator) {
        return denominator == 0 ? null : Math.round((double) numerator / denominator * 10000d) / 10000d;
    }
}
