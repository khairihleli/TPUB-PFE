package com.example.tpubpfe.service.supervision;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/** Occupancy rule of the zone saturation alert (docs/round2-contract.md §5.3). */
class SaturationRuleTest {

    @Test
    void occupancyIsTheShareOfSaturatedActiveSupports() {
        assertThat(SupervisionService.occupancy(0, 0)).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(SupervisionService.occupancy(3, 0)).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(SupervisionService.occupancy(1, 2)).isEqualByComparingTo(new BigDecimal("0.5"));
        assertThat(SupervisionService.occupancy(9, 10)).isEqualByComparingTo(new BigDecimal("0.9"));
        assertThat(SupervisionService.occupancy(2, 3)).isEqualByComparingTo(new BigDecimal("0.6667"));
        assertThat(SupervisionService.occupancy(4, 4)).isEqualByComparingTo(BigDecimal.ONE);
    }
}
