package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.model.Campaign;

public final class CampaignMapper {

    private CampaignMapper() {
    }

    public static CampaignResponse toResponse(Campaign campaign) {
        return CampaignResponse.builder()
                .id(campaign.getId())
                .clientId(campaign.getClient().getId())
                .name(campaign.getName())
                .objective(campaign.getObjective())
                .budget(campaign.getBudget())
                .consumedBudget(campaign.getConsumedBudget())
                .status(campaign.getStatus() != null ? campaign.getStatus().name() : null)
                .aiStatus(campaign.getAiStatus() != null ? campaign.getAiStatus().name() : null)
                .adminStatus(campaign.getAdminStatus() != null ? campaign.getAdminStatus().name() : null)
                .startDate(campaign.getStartDate())
                .endDate(campaign.getEndDate())
                .startTime(campaign.getStartTime())
                .endTime(campaign.getEndTime())
                .estimatedViews(campaign.getEstimatedViews())
                .priorityScore(campaign.getPriorityScore())
                .createdAt(campaign.getCreatedAt())
                .submittedAt(campaign.getSubmittedAt())
                .validatedAt(campaign.getValidatedAt())
                .build();
    }
}
