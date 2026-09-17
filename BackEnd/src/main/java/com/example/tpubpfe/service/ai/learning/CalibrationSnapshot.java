package com.example.tpubpfe.service.ai.learning;

import java.util.Map;

/**
 * Thresholds and rule weights applied by one analysis (docs/round2-contract.md §2.6).
 *
 * @param version          calibration version, null when none is stored yet
 * @param approveThreshold review from risk ≥ A
 * @param rejectThreshold  reject when risk &gt; R
 * @param ruleWeights      rule id → weight; absent = 1.0
 */
public record CalibrationSnapshot(Integer version, int approveThreshold, int rejectThreshold, Map<Long, Double> ruleWeights) {

    public static final int DEFAULT_APPROVE = 31;
    public static final int DEFAULT_REJECT = 70;
    public static final CalibrationSnapshot DEFAULT = new CalibrationSnapshot(null, DEFAULT_APPROVE, DEFAULT_REJECT, Map.of());

    public CalibrationSnapshot {
        ruleWeights = ruleWeights == null ? Map.of() : Map.copyOf(ruleWeights);
    }

    public double weight(Long ruleId) {
        if (ruleId == null) {
            return 1d;
        }
        Double weight = ruleWeights.get(ruleId);
        return weight == null ? 1d : weight;
    }
}
