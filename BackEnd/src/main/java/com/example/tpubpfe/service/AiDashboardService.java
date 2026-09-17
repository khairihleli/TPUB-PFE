package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AiDashboardResponse;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.AiIssue;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * {@code GET /api/ai/dashboard}: AI quality indicators and AI / administrator disagreements.
 */
@Service
@RequiredArgsConstructor
public class AiDashboardService {

    static final int TOP_ISSUES = 10;

    private final AiContentCheckRepository checkRepository;
    private final AiDecisionLogRepository decisionLogRepository;

    @Transactional(readOnly = true)
    public AiDashboardResponse dashboard() {
        return compute(checkRepository.findByIsPreviewFalse(), decisionLogRepository.findByDecisionType(AiDecisionType.ADMIN));
    }

    static AiDashboardResponse compute(List<AiContentCheck> checks, List<AiDecisionLog> adminLogs) {
        long total = checks.size();
        double avgRisk = checks.stream().mapToInt(c -> c.getRiskScore() == null ? 0 : c.getRiskScore()).average().orElse(0);
        double avgQuality = checks.stream().mapToInt(c -> c.getQualityScore() == null ? 0 : c.getQualityScore()).average().orElse(0);

        long validated = adminLogs.stream().filter(log -> isValidation(log.getDecision())).count();
        long rejected = adminLogs.stream().filter(log -> "REJECTED".equals(log.getDecision())).count();
        long decided = validated + rejected;
        long overrides = adminLogs.stream().filter(log -> "VALIDATED_OVERRIDE".equals(log.getDecision())).count();
        long disagreements = adminLogs.stream().filter(AiDashboardService::isDisagreement).count();

        List<AiDashboardResponse.SectorCount> bySector = checks.stream()
                .map(AiContentCheck::getSector)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()))
                .entrySet().stream()
                .sorted(Map.Entry.<com.example.tpubpfe.model.AiSector, Long>comparingByValue().reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .map(entry -> new AiDashboardResponse.SectorCount(entry.getKey(), entry.getValue()))
                .toList();

        List<AiDashboardResponse.IssueCount> topIssues = checks.stream()
                .flatMap(check -> check.getIssues() != null && !check.getIssues().isEmpty()
                        ? check.getIssues().stream().map(AiIssue::getLabel)
                        : (check.getDetectedIssues() == null ? java.util.stream.Stream.<String>empty() : check.getDetectedIssues().stream()))
                .filter(label -> label != null && !label.isBlank())
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()))
                .entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(TOP_ISSUES)
                .map(entry -> new AiDashboardResponse.IssueCount(entry.getKey(), entry.getValue()))
                .toList();

        return AiDashboardResponse.builder()
                .totalChecks(total)
                .avgRiskScore(round2(avgRisk))
                .avgQualityScore(round2(avgQuality))
                .approvedCount(count(checks, AiCheckStatus.APPROVED))
                .reviewRequiredCount(count(checks, AiCheckStatus.REVIEW_REQUIRED))
                .rejectedCount(count(checks, AiCheckStatus.REJECTED))
                .adminValidatedCount(validated)
                .adminRejectedCount(rejected)
                .validationRate(decided == 0 ? 0 : round4((double) validated / decided))
                .rejectionRate(decided == 0 ? 0 : round4((double) rejected / decided))
                .overrideCount(overrides)
                .disagreementCount(disagreements)
                .bySector(bySector)
                .topIssues(topIssues)
                .build();
    }

    /** AI APPROVED then admin REJECTED, or AI REVIEW_REQUIRED/REJECTED then admin VALIDATED. */
    static boolean isDisagreement(AiDecisionLog log) {
        if (log.getCheck() == null || log.getCheck().getAiStatus() == null) {
            return false;
        }
        AiCheckStatus ai = log.getCheck().getAiStatus();
        if ("REJECTED".equals(log.getDecision())) {
            return ai == AiCheckStatus.APPROVED;
        }
        return isValidation(log.getDecision()) && ai != AiCheckStatus.APPROVED;
    }

    private static boolean isValidation(String decision) {
        return "VALIDATED".equals(decision) || "VALIDATED_OVERRIDE".equals(decision);
    }

    private static long count(List<AiContentCheck> checks, AiCheckStatus status) {
        return checks.stream().filter(check -> check.getAiStatus() == status).count();
    }

    private static double round2(double value) {
        return Math.round(value * 100d) / 100d;
    }

    private static double round4(double value) {
        return Math.round(value * 10000d) / 10000d;
    }
}
