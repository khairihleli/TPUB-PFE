package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * {@code GET /api/statistics/campaigns/{id}} (contract §2.9).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatisticsCampaignResponse {

    private Long campaignId;
    private String name;
    private String status;
    private LocalDate from;
    private LocalDate to;
    private BigDecimal budget;
    private BigDecimal consumedBudget;
    private BigDecimal remainingBudget;
    private long estimatedViews;
    private BigDecimal estimatedCost;
    private long views;
    private long clicks;
    private long interactions;
    private Instant lastDiffusionAt;
    private List<StatisticsDailyRow> daily;
    private List<SupportRow> bySupport;
    private List<ZoneRow> byZone;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SupportRow {
        private Long supportId;
        private String name;
        private String zoneName;
        private long views;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ZoneRow {
        private Long zoneId;
        private String name;
        private long views;
    }
}
