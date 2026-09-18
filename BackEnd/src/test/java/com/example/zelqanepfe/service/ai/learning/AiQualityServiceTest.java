package com.example.zelqanepfe.service.ai.learning;

import com.example.zelqanepfe.model.AiFeedbackOutcome;
import com.example.zelqanepfe.model.AiMatchedRule;
import com.example.zelqanepfe.model.AiModerationRule;
import com.example.zelqanepfe.model.AiModerationSeverity;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AiQualityServiceTest {

    private static final LocalDate FROM = LocalDate.of(2026, 9, 2); // Wednesday
    private static final LocalDate TO = LocalDate.of(2026, 9, 17);  // Thursday

    @Test
    void ratesAreNullWithoutDenominatorAndWeeksAreZeroFilled() {
        var empty = AiQualityService.compute(FROM, TO, List.of(), List.of(), Map.of(), null);
        assertThat(empty.getFeedbackCount()).isZero();
        assertThat(empty.getFalsePositiveRate()).isNull();
        assertThat(empty.getFalseNegativeRate()).isNull();
        assertThat(empty.getAccuracy()).isNull();
        assertThat(empty.getOverrideRate()).isNull();
        assertThat(empty.getWeekly()).extracting(w -> w.weekStart().toString())
                .containsExactly("2026-08-31", "2026-09-07", "2026-09-14");
        assertThat(empty.getWeekly()).allSatisfy(w -> assertThat(w.feedback()).isZero());
    }

    @Test
    void countsRatesAndPerRulePrecision() {
        AiMatchedRule deleted = AiMatchedRule.builder().ruleId(99L).ruleName("ancienne").severity(AiModerationSeverity.HIGH).build();
        List<AiQualityService.Row> rows = List.of(
                new AiQualityService.Row(AiFeedbackOutcome.CONFIRMED_APPROVAL, "VALIDATED", LocalDate.of(2026, 9, 2), List.of(), List.of()),
                new AiQualityService.Row(AiFeedbackOutcome.FALSE_POSITIVE, "VALIDATED_OVERRIDE", LocalDate.of(2026, 9, 8), List.of(1L), List.of()),
                new AiQualityService.Row(AiFeedbackOutcome.FALSE_POSITIVE, "VALIDATED", LocalDate.of(2026, 9, 9), List.of(1L, 99L), List.of(deleted)),
                new AiQualityService.Row(AiFeedbackOutcome.CONFIRMED_FLAG, "REJECTED", LocalDate.of(2026, 9, 15), List.of(1L), List.of()),
                new AiQualityService.Row(AiFeedbackOutcome.FALSE_NEGATIVE, "REJECTED", LocalDate.of(2026, 9, 16), List.of(), List.of()));
        AiModerationRule rule = AiModerationRule.builder().id(1L).ruleName("casino").severity(AiModerationSeverity.MEDIUM)
                .isActive(true).build();

        var quality = AiQualityService.compute(FROM, TO, rows, List.of(rule), Map.of(1L, 0.85), null);

        assertThat(quality.getFeedbackCount()).isEqualTo(5);
        assertThat(quality.getFalsePositiveRate()).isEqualTo(0.6667); // 2 / (2 + 1)
        assertThat(quality.getFalseNegativeRate()).isEqualTo(0.5);    // 1 / (1 + 1)
        assertThat(quality.getAccuracy()).isEqualTo(0.4);             // (1 + 1) / 5
        assertThat(quality.getOverrideRate()).isEqualTo(0.3333);      // 1 / 3 validations
        assertThat(quality.getPerRule()).hasSize(2);
        var casino = quality.getPerRule().get(0);
        assertThat(casino.ruleName()).isEqualTo("casino");
        assertThat(casino.matches()).isEqualTo(3);
        assertThat(casino.confirmed()).isEqualTo(1);
        assertThat(casino.falsePositives()).isEqualTo(2);
        assertThat(casino.precision()).isEqualTo(0.3333);
        assertThat(casino.weight()).isEqualTo(0.85);
        assertThat(casino.active()).isTrue();
        var old = quality.getPerRule().get(1);
        assertThat(old.ruleName()).isEqualTo("ancienne");
        assertThat(old.severity()).isEqualTo(AiModerationSeverity.HIGH);
        assertThat(old.active()).isFalse();
        assertThat(old.weight()).isEqualTo(1.0);
        assertThat(quality.getWeekly()).extracting(w -> w.feedback() + "/" + w.falsePositives() + "/" + w.falseNegatives() + "/" + w.overrides())
                .containsExactly("1/0/0/0", "2/2/0/1", "2/0/1/0");
    }
}
