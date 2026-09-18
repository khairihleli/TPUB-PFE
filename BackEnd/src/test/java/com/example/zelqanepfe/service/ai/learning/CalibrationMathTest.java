package com.example.zelqanepfe.service.ai.learning;

import com.example.zelqanepfe.model.AiCheckStatus;
import com.example.zelqanepfe.model.AiFeedbackOutcome;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CalibrationMathTest {

    private static CalibrationMath.Sample sample(AiCheckStatus ai, String admin, Long... rules) {
        return new CalibrationMath.Sample(CalibrationMath.outcome(ai, admin), ai, admin, List.of(rules));
    }

    private static List<CalibrationMath.Sample> repeat(int count, CalibrationMath.Sample sample) {
        List<CalibrationMath.Sample> list = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            list.add(sample);
        }
        return list;
    }

    @Test
    void outcomeTable() {
        assertThat(CalibrationMath.outcome(AiCheckStatus.APPROVED, "VALIDATED")).isEqualTo(AiFeedbackOutcome.CONFIRMED_APPROVAL);
        assertThat(CalibrationMath.outcome(AiCheckStatus.APPROVED, "REJECTED")).isEqualTo(AiFeedbackOutcome.FALSE_NEGATIVE);
        assertThat(CalibrationMath.outcome(AiCheckStatus.REVIEW_REQUIRED, "VALIDATED")).isEqualTo(AiFeedbackOutcome.FALSE_POSITIVE);
        assertThat(CalibrationMath.outcome(AiCheckStatus.REJECTED, "VALIDATED_OVERRIDE")).isEqualTo(AiFeedbackOutcome.FALSE_POSITIVE);
        assertThat(CalibrationMath.outcome(AiCheckStatus.REVIEW_REQUIRED, "REJECTED")).isEqualTo(AiFeedbackOutcome.CONFIRMED_FLAG);
    }

    @Test
    void belowMinimumFeedbackKeepsDefaults() {
        var result = CalibrationMath.compute(repeat(19, sample(AiCheckStatus.REVIEW_REQUIRED, "VALIDATED")), 31, 70,
                Map.of(), 20, 3);
        assertThat(result.approveThreshold()).isEqualTo(31);
        assertThat(result.rejectThreshold()).isEqualTo(70);
        assertThat(result.feedbackCount()).isEqualTo(19);
        assertThat(result.falsePositives()).isEqualTo(19);
    }

    @Test
    void manyFalsePositivesRaiseTheReviewThresholdWithinTheStep() {
        // 30 REVIEW_REQUIRED validated: fpRate 1, fnRate 0, c = 30/50 = 0.6 → A = 31 + 6 = 37 → step-limited to 36
        // m = 30, rej = 0 → R = 70 − round(10 × −0.5 × 30/50) = 73 ; max(73, 57) = 73
        var result = CalibrationMath.compute(repeat(30, sample(AiCheckStatus.REVIEW_REQUIRED, "VALIDATED")), 31, 70,
                Map.of(), 20, 3);
        assertThat(result.approveThreshold()).isEqualTo(36);
        assertThat(result.rejectThreshold()).isEqualTo(73);
        assertThat(result.falsePositiveRate()).isEqualTo(1.0);
        assertThat(result.reviewed()).isEqualTo(30);

        // next run from the moved version reaches the target
        var next = CalibrationMath.compute(repeat(30, sample(AiCheckStatus.REVIEW_REQUIRED, "VALIDATED")), 36, 73,
                Map.of(), 20, 3);
        assertThat(next.approveThreshold()).isEqualTo(37);
    }

    @Test
    void falseNegativesLowerTheReviewThresholdAndRejectStaysTwentyAbove() {
        List<CalibrationMath.Sample> samples = new ArrayList<>(repeat(40, sample(AiCheckStatus.APPROVED, "REJECTED")));
        // fnRate 1 → A = clamp(21, 45, 31 − round(10 × 40/60)) = 24
        var result = CalibrationMath.compute(samples, 25, 60, Map.of(), 20, 3);
        assertThat(result.approveThreshold()).isEqualTo(24);
        // m = 0 → R = 70 then max(70, 44) = 70 → step-limited from 60 to 65
        assertThat(result.rejectThreshold()).isEqualTo(65);

        samples.addAll(repeat(40, sample(AiCheckStatus.REVIEW_REQUIRED, "REJECTED")));
        // n = 80, FN 40, CF 40, CA 0 FP 0 → fpRate 0, fnRate 1 → A = 31 − round(10 × 0.8) = 23
        // m = 40, rej = 1 → R = 70 − round(10 × 0.5 × 40/60) = 67
        var mixed = CalibrationMath.compute(samples, 23, 67, Map.of(), 20, 3);
        assertThat(mixed.approveThreshold()).isEqualTo(23);
        assertThat(mixed.rejectThreshold()).isEqualTo(67);
    }

    @Test
    void ruleWeightsNeedSupportAndMoveByAtMostAQuarter() {
        assertThat(CalibrationMath.ruleWeight(1, 1, 1.0, 3)).isEqualTo(1.0);
        // s = 10, TP 0 → p = 1/12, target = 1 + (1/12 − 0.5) × 10/20 = 0.79
        assertThat(CalibrationMath.ruleWeight(0, 10, 1.0, 3)).isEqualTo(0.79);
        // s = 100, TP 100 → p = 101/102, target ≈ 1.445, limited to 1.25 from 1.0
        assertThat(CalibrationMath.ruleWeight(100, 0, 1.0, 3)).isEqualTo(1.25);
        assertThat(CalibrationMath.ruleWeight(100, 0, 1.4, 3)).isEqualTo(1.45);
        assertThat(CalibrationMath.ruleWeight(0, 1000, 0.5, 3)).isEqualTo(0.51);
        assertThat(CalibrationMath.ruleWeight(0, 1000, 0.2, 3)).isEqualTo(0.5);

        List<CalibrationMath.Sample> samples = new ArrayList<>(repeat(10, sample(AiCheckStatus.REVIEW_REQUIRED, "VALIDATED", 7L)));
        samples.add(sample(AiCheckStatus.REVIEW_REQUIRED, "REJECTED", 8L));
        var result = CalibrationMath.compute(samples, 31, 70, Map.of(8L, 1.2), 20, 3);
        assertThat(result.ruleWeights()).containsExactlyEntriesOf(Map.of(7L, 0.79));
        assertThat(CalibrationMath.sameWeights(Map.of(7L, 0.79, 9L, 1.0), Map.of(7L, 0.790))).isTrue();
        assertThat(CalibrationMath.sameWeights(Map.of(7L, 0.8), Map.of())).isFalse();
    }
}
