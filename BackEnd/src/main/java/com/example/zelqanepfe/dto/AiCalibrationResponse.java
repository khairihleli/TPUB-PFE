package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/** One calibration version (docs/round2-contract.md §2.7). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiCalibrationResponse {
    private int version;
    private boolean active;
    private String trigger;
    private boolean changed;
    private int approveThreshold;
    private int rejectThreshold;
    private List<RuleWeight> ruleWeights;
    private int feedbackCount;
    private int falsePositives;
    private int falseNegatives;
    private String createdByName;
    private Instant createdAt;

    public record RuleWeight(Long ruleId, String ruleName, double weight) {
    }
}
