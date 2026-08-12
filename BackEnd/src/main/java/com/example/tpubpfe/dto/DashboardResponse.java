package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardResponse {

    private long totalCampaigns;
    private long activeCampaigns;
    private long pendingCampaigns;
    private long aiPendingCampaigns;
    private long aiRejectedCampaigns;
    private long availableSupports;
    private long confirmedReservations;
    private long totalViews;
    private BigDecimal estimatedBudget;
    private BigDecimal consumedBudget;
}
