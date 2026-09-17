package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.AiModerationSeverity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/** AI error dashboard over a period (docs/round2-contract.md §2.7). Rates are null when their denominator is 0. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiQualityResponse {
    private LocalDate from;
    private LocalDate to;
    private long feedbackCount;
    private long confirmedApprovals;
    private long falseNegatives;
    private long falsePositives;
    private long confirmedFlags;
    private Double falsePositiveRate;
    private Double falseNegativeRate;
    private Double accuracy;
    private Double overrideRate;
    private List<RuleQuality> perRule;
    private List<WeekRow> weekly;
    private AiCalibrationResponse activeCalibration;

    public record RuleQuality(Long ruleId, String ruleName, AiModerationSeverity severity, boolean active, long matches,
                              long confirmed, long falsePositives, Double precision, double weight) {
    }

    public record WeekRow(LocalDate weekStart, long feedback, long falsePositives, long falseNegatives, long overrides) {
    }
}
