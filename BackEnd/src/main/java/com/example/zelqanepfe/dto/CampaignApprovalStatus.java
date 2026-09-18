package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/** Multi-level approval state of one campaign validation cycle (docs/round2-contract.md §5.4). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignApprovalStatus {

    private Long campaignId;
    /** True when this validation needs several administrators. */
    private boolean required;
    /** DEROGATION_IA and/or RISQUE_ELEVE. */
    @Builder.Default
    private List<String> reasons = new ArrayList<>();
    private Integer riskScore;
    private int riskThreshold;
    /** Effective count, capped by the number of active administrators. */
    private int approvalsRequired;
    private int approvalsRequiredConfigured;
    @Builder.Default
    private List<ApprovalResponse> approvals = new ArrayList<>();
    private String cycleKey;
    /** The caller is an administrator who has not approved this cycle yet. */
    private boolean canApprove;
}
