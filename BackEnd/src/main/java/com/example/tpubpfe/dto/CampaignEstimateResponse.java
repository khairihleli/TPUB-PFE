package com.example.tpubpfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * {@code GET /api/estimates/campaign/{id}} (contract §2.4).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignEstimateResponse {

    private Long campaignId;
    private BigDecimal budget;
    private BigDecimal consumedBudget;
    private BigDecimal remainingBudget;
    private List<Line> lines;
    private long totalViews;
    private BigDecimal totalCost;
    /** budget / totalCost, null when totalCost is 0. */
    private BigDecimal budgetCoverage;
    private boolean budgetSufficient;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Line {
        private Long reservationId;
        private Long supportId;
        private String supportName;
        private String zoneName;
        private String reservationStatus;
        private LocalDate startDate;
        private LocalDate endDate;
        @JsonFormat(pattern = "HH:mm:ss")
        private LocalTime startTime;
        @JsonFormat(pattern = "HH:mm:ss")
        private LocalTime endTime;
        private long estimatedViews;
        private BigDecimal estimatedCost;
        private BigDecimal baseCost;
        private BigDecimal priceMultiplier;
        /** Breakdown stored at booking time; null for reservations created before V8. */
        private PriceBreakdown pricing;
    }
}
