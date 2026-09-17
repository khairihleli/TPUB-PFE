package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * {@code GET /api/statistics/mine} (contract §2.9).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatisticsMineResponse {

    private LocalDate from;
    private LocalDate to;
    private Totals totals;
    private Map<String, Long> statusCounts;
    private List<StatisticsDailyRow> daily;
    private List<CampaignRow> byCampaign;
    private List<StatisticsCampaignResponse.SupportRow> bySupport;
    private List<StatisticsCampaignResponse.ZoneRow> byZone;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Totals {
        private long campaigns;
        private long activeCampaigns;
        private long pendingCampaigns;
        private long views;
        private long clicks;
        private long interactions;
        private long estimatedViews;
        private BigDecimal estimatedCost;
        private BigDecimal estimatedBudget;
        private BigDecimal consumedBudget;
        private long confirmedReservations;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CampaignRow {
        private Long campaignId;
        private String name;
        private String status;
        private long views;
        private long clicks;
        private long interactions;
        private long estimatedViews;
        private BigDecimal estimatedCost;
        private BigDecimal budget;
        private BigDecimal consumedBudget;
    }
}
