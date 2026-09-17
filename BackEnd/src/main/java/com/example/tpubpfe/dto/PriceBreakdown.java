package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Dynamic price of one support over one window (docs/round2-contract.md §4.6). Also stored as JSON on the reservation
 * at booking time ({@code reservations.pricing_breakdown}).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PriceBreakdown {

    private BigDecimal baseCost;
    private BigDecimal multiplier;
    private BigDecimal finalCost;
    private boolean clamped;
    private boolean enabled;
    private Factors factors;
    private Details details;
    @Builder.Default
    private List<String> explanations = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Factors {
        private BigDecimal hour;
        private BigDecimal dayOfWeek;
        private BigDecimal demand;
        private BigDecimal scarcity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Details {
        private BigDecimal supportOccupancy;
        private BigDecimal zoneOccupancy;
        private BigDecimal zoneAvailability;
        @Builder.Default
        private List<HourBandDetail> hourBands = new ArrayList<>();
        @Builder.Default
        private List<DayDetail> days = new ArrayList<>();
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HourBandDetail {
        private String label;
        private long minutes;
        private BigDecimal multiplier;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DayDetail {
        /** LUNDI … DIMANCHE. */
        private String dayOfWeek;
        private int count;
        private BigDecimal multiplier;
    }
}
