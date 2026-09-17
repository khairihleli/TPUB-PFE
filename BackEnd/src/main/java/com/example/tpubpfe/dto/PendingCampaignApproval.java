package com.example.tpubpfe.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** A campaign waiting for a second administrator (docs/round2-contract.md §5.4). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PendingCampaignApproval {

    @JsonUnwrapped
    private CampaignApprovalStatus approval;
    private String campaignName;
    private String clientName;
    /** Campaign status (APPROVED_BY_AI, REVIEW_REQUIRED...). */
    private String status;
    /** First approval of the cycle. */
    private Instant requestedAt;
}
