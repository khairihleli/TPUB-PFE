package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.AdminRejectRequest;
import com.example.tpubpfe.dto.AdminValidateRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.PriorityRequest;
import com.example.tpubpfe.service.AdminCampaignService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/campaigns")
@RequiredArgsConstructor
public class AdminCampaignController {

    private final AdminCampaignService adminCampaignService;

    @Operation(summary = "Validate a campaign after AI review (overrideAi required for REVIEW_REQUIRED)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{campaignId}/validate")
    public ResponseEntity<CampaignResponse> validate(
            @PathVariable Long campaignId,
            @Valid @RequestBody(required = false) AdminValidateRequest request
    ) {
        return ResponseEntity.ok(adminCampaignService.validate(campaignId, request));
    }

    @Operation(summary = "Reject / block a campaign (reason required)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{campaignId}/reject")
    public ResponseEntity<CampaignResponse> reject(
            @PathVariable Long campaignId,
            @RequestBody(required = false) AdminRejectRequest request,
            @RequestParam(required = false) String reason
    ) {
        String effectiveReason = request != null && request.getReason() != null ? request.getReason() : reason;
        return ResponseEntity.ok(adminCampaignService.reject(campaignId, effectiveReason));
    }

    @Operation(summary = "Change the diffusion priority of a campaign (0..10)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PutMapping("/{campaignId}/priority")
    public ResponseEntity<CampaignResponse> setPriority(
            @PathVariable Long campaignId,
            @Valid @RequestBody PriorityRequest request
    ) {
        return ResponseEntity.ok(adminCampaignService.setPriority(campaignId, request.getPriorityScore()));
    }
}
