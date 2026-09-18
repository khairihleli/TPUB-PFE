package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardResponse {

    private long totalCampaigns;
    private long activeCampaigns;
    /** PENDING_AI_CHECK + APPROVED_BY_AI + REVIEW_REQUIRED. */
    private long pendingCampaigns;
    private long aiPendingCampaigns;
    private long aiRejectedCampaigns;
    private long availableSupports;
    private long confirmedReservations;
    /** PUBLICITE diffusions only. */
    private long totalViews;
    /** Σ budget of non-BROUILLON campaigns. */
    private BigDecimal estimatedBudget;
    private BigDecimal consumedBudget;

    private long aiFlaggedCampaigns;
    private long reviewRequiredCampaigns;
    private long approvedByAiCampaigns;
    private long validatedCampaigns;
    private long terminatedCampaigns;
    private long blockedCampaigns;
    private long draftCampaigns;
    private long totalClients;
    private long pendingClients;
    private long totalSupports;
    private Map<String, Long> supportsByStatus;
    private long totalZones;
    private long activeZones;
    private long temporaryReservations;
    private long cancelledReservations;
    private long expiredReservations;
    private long totalDiffusions;
    private long emergencyViews;
    private long defaultViews;
    private long viewsToday;
    private long totalClicks;
    private long totalInteractions;
    /** Σ estimatedCost of TEMPORAIRE | CONFIRMEE reservations. */
    private BigDecimal estimatedCost;
    /** Σ payments_simulation.amount with status SIMULATED | COMPLETED. */
    private BigDecimal simulatedRevenue;
    private long activeEmergencies;
}
