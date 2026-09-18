package com.example.zelqanepfe.service.ai.learning;

import com.example.zelqanepfe.model.AiCheckStatus;
import com.example.zelqanepfe.model.AiFeedbackOutcome;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Recalibration formulas, pure (docs/round2-contract.md §2.6).
 *
 * <pre>
 * fpRate = FP / max(1, FP + CF)        fnRate = FN / max(1, FN + CA)
 * n &lt; min-feedback: A = 31, R = 70
 * else c = n / (n + 20); A = clamp(21, 45, 31 + round(10 × (fpRate − fnRate) × c))
 *      m = feedback on REVIEW_REQUIRED checks, rej = share rejected by the admin
 *      R = clamp(60, 85, 70 − round(10 × (rej − 0.5) × m / (m + 20))); R = max(R, A + 20)
 * then A, R move by at most ±5 from the active version.
 * Rule weight: TP = admin REJECTED, FP = admin VALIDATED(_OVERRIDE), s = TP + FP;
 *      s &lt; min-rule-support → 1.0, else p = (TP + 1) / (s + 2), target = 1 + (p − 0.5) × s / (s + 10),
 *      w = clamp(0.5, 1.5, clamp(w_prev − 0.25, w_prev + 0.25, target)) rounded to 2 decimals.
 * </pre>
 */
public final class CalibrationMath {

    public static final int A0 = CalibrationSnapshot.DEFAULT_APPROVE;
    public static final int R0 = CalibrationSnapshot.DEFAULT_REJECT;
    public static final int A_MIN = 21;
    public static final int A_MAX = 45;
    public static final int R_MIN = 60;
    public static final int R_MAX = 85;
    public static final int MAX_STEP = 5;
    public static final double W_MIN = 0.5;
    public static final double W_MAX = 1.5;
    public static final double W_STEP = 0.25;

    private CalibrationMath() {
    }

    /** One feedback row as seen by the formulas. */
    public record Sample(AiFeedbackOutcome outcome, AiCheckStatus aiStatus, String adminDecision, Collection<Long> ruleIds) {

        public Sample {
            ruleIds = ruleIds == null ? List.of() : ruleIds;
        }

        boolean adminRejected() {
            return "REJECTED".equals(adminDecision);
        }
    }

    public record Result(int approveThreshold, int rejectThreshold, Map<Long, Double> ruleWeights, int feedbackCount,
                         int falsePositives, int falseNegatives, double falsePositiveRate, double falseNegativeRate,
                         int reviewed, double reviewedRejectedShare) {
    }

    public static Result compute(List<Sample> samples, int previousApprove, int previousReject,
                                 Map<Long, Double> previousWeights, int minFeedback, int minRuleSupport) {
        int n = samples.size();
        int fp = count(samples, AiFeedbackOutcome.FALSE_POSITIVE);
        int fn = count(samples, AiFeedbackOutcome.FALSE_NEGATIVE);
        int ca = count(samples, AiFeedbackOutcome.CONFIRMED_APPROVAL);
        int cf = count(samples, AiFeedbackOutcome.CONFIRMED_FLAG);
        double fpRate = (double) fp / Math.max(1, fp + cf);
        double fnRate = (double) fn / Math.max(1, fn + ca);

        List<Sample> reviewed = samples.stream().filter(s -> s.aiStatus() == AiCheckStatus.REVIEW_REQUIRED).toList();
        int m = reviewed.size();
        double rej = m == 0 ? 0 : (double) reviewed.stream().filter(Sample::adminRejected).count() / m;

        int approve;
        int reject;
        if (n < minFeedback) {
            approve = A0;
            reject = R0;
        } else {
            double c = (double) n / (n + 20);
            approve = clamp(A_MIN, A_MAX, A0 + (int) Math.round(10 * (fpRate - fnRate) * c));
            reject = clamp(R_MIN, R_MAX, R0 - (int) Math.round(10 * (rej - 0.5) * m / (m + 20)));
            reject = Math.max(reject, approve + 20);
        }
        approve = clamp(A_MIN, A_MAX, clamp(previousApprove - MAX_STEP, previousApprove + MAX_STEP, approve));
        reject = clamp(R_MIN, R_MAX, clamp(previousReject - MAX_STEP, previousReject + MAX_STEP, reject));

        Map<Long, int[]> perRule = new TreeMap<>();
        for (Sample sample : samples) {
            for (Long ruleId : sample.ruleIds()) {
                if (ruleId == null) {
                    continue;
                }
                int[] counts = perRule.computeIfAbsent(ruleId, id -> new int[2]);
                if (sample.adminRejected()) {
                    counts[0]++;
                } else {
                    counts[1]++;
                }
            }
        }
        Map<Long, Double> weights = new TreeMap<>();
        for (Map.Entry<Long, int[]> entry : perRule.entrySet()) {
            double previous = previousWeights == null ? 1d : previousWeights.getOrDefault(entry.getKey(), 1d);
            double weight = ruleWeight(entry.getValue()[0], entry.getValue()[1], previous, minRuleSupport);
            if (weight != 1d) {
                weights.put(entry.getKey(), weight);
            }
        }
        return new Result(approve, reject, weights, n, fp, fn, round(fpRate, 4), round(fnRate, 4), m, round(rej, 4));
    }

    public static double ruleWeight(int truePositives, int falsePositives, double previous, int minRuleSupport) {
        int s = truePositives + falsePositives;
        if (s < minRuleSupport) {
            return 1d;
        }
        double p = (truePositives + 1d) / (s + 2d);
        double target = 1 + (p - 0.5) * s / (s + 10d);
        double bounded = Math.max(previous - W_STEP, Math.min(previous + W_STEP, target));
        return round(Math.max(W_MIN, Math.min(W_MAX, bounded)), 2);
    }

    /** Outcome of an admin decision against the AI status of the check (§2.6 table). */
    public static AiFeedbackOutcome outcome(AiCheckStatus aiStatus, String adminDecision) {
        boolean rejected = "REJECTED".equals(adminDecision);
        if (aiStatus == AiCheckStatus.APPROVED) {
            return rejected ? AiFeedbackOutcome.FALSE_NEGATIVE : AiFeedbackOutcome.CONFIRMED_APPROVAL;
        }
        return rejected ? AiFeedbackOutcome.CONFIRMED_FLAG : AiFeedbackOutcome.FALSE_POSITIVE;
    }

    /** Weights equal after dropping neutral (1.0) entries. */
    public static boolean sameWeights(Map<Long, Double> a, Map<Long, Double> b) {
        return normalized(a).equals(normalized(b));
    }

    private static Map<Long, Double> normalized(Map<Long, Double> weights) {
        Map<Long, Double> result = new TreeMap<>();
        if (weights != null) {
            weights.forEach((id, w) -> {
                if (id != null && w != null && round(w, 2) != 1d) {
                    result.put(id, round(w, 2));
                }
            });
        }
        return result;
    }

    private static int count(List<Sample> samples, AiFeedbackOutcome outcome) {
        return (int) samples.stream().filter(s -> s.outcome() == outcome).count();
    }

    static int clamp(int min, int max, int value) {
        return Math.max(min, Math.min(max, value));
    }

    static double round(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
}
