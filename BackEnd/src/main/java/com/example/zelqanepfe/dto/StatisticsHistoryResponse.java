package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One day of {@code GET /api/statistics/history} (platform snapshot + figures recomputed from the logs).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatisticsHistoryResponse {

    private LocalDate date;
    private long totalCampaigns;
    private long activeCampaigns;
    private long pendingCampaigns;
    private long aiPendingCampaigns;
    private long aiRejectedCampaigns;
    private long availableSupports;
    private long confirmedReservations;
    private long views;
    private long clicks;
    private long interactions;
    private BigDecimal estimatedBudget;
    private BigDecimal consumedBudget;
    private BigDecimal avgRiskScore;
    private BigDecimal avgQualityScore;
}
