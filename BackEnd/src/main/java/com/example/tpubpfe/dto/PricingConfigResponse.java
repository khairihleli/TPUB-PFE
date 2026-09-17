package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** {@code GET /api/pricing/config} (docs/round2-contract.md §4.6). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PricingConfigResponse {

    private boolean enabled;
    private BigDecimal minMultiplier;
    private BigDecimal maxMultiplier;
    private List<HourBand> hourBands;
    /** Keys LUNDI … DIMANCHE, in week order. */
    private Map<String, BigDecimal> dayMultipliers;
    private BigDecimal demandWeight;
    private BigDecimal scarcityWeight;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HourBand {
        /** HH:mm. */
        private String start;
        /** HH:mm, 24:00 for the end of the day. */
        private String end;
        private BigDecimal multiplier;
        private String label;
    }
}
