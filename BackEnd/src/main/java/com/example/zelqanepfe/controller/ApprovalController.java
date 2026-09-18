package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.CampaignApprovalStatus;
import com.example.zelqanepfe.dto.PendingApprovalsResponse;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.service.AdminCampaignService;
import com.example.zelqanepfe.service.EmergencyService;
import com.example.zelqanepfe.service.SecurityUtils;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Multi-level approvals waiting for a decision (docs/round2-contract.md §5.4). */
@RestController
@RequestMapping("/api/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final AdminCampaignService adminCampaignService;
    private final EmergencyService emergencyService;

    @Operation(summary = "Campaigns and emergency messages waiting for another administrator")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/pending")
    public ResponseEntity<PendingApprovalsResponse> pending() {
        UserDetailsImpl user = SecurityUtils.getCurrentUser();
        boolean canApprove = RoleCode.ADMINISTRATEUR.name().equals(user.getRoleCode());
        return ResponseEntity.ok(PendingApprovalsResponse.builder()
                .campaigns(adminCampaignService.pendingApprovals(user.getId(), canApprove))
                .emergencies(emergencyService.pendingApprovals(user.getId(), canApprove))
                .build());
    }

    @Operation(summary = "Approval state of one campaign validation cycle")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/campaigns/{campaignId}")
    public ResponseEntity<CampaignApprovalStatus> campaign(@PathVariable Long campaignId) {
        return ResponseEntity.ok(adminCampaignService.approvalStatus(campaignId));
    }
}
