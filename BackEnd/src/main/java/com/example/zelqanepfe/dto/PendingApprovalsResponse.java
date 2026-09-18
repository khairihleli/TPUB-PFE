package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/** {@code GET /api/approvals/pending} (docs/round2-contract.md §5.4). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PendingApprovalsResponse {

    @Builder.Default
    private List<PendingCampaignApproval> campaigns = new ArrayList<>();
    @Builder.Default
    private List<PendingEmergencyApproval> emergencies = new ArrayList<>();
}
