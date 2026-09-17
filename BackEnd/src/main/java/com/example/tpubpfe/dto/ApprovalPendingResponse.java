package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 202 body of a campaign validation that still needs another administrator (docs/round2-contract.md §5.4). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalPendingResponse {

    @Builder.Default
    private boolean pending = true;
    private CampaignApprovalStatus approval;
}
