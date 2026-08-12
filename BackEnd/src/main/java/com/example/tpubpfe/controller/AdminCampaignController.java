package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.MessageResponse;
import com.example.tpubpfe.service.AdminCampaignService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/campaigns")
@RequiredArgsConstructor
public class AdminCampaignController {

    private final AdminCampaignService adminCampaignService;

    @Operation(summary = "Validate a campaign after AI review")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{campaignId}/validate")
    public ResponseEntity<CampaignResponse> validate(@PathVariable Long campaignId) {
        return ResponseEntity.ok(adminCampaignService.validate(campaignId));
    }

    @Operation(summary = "Reject a campaign after AI review")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{campaignId}/reject")
    public ResponseEntity<MessageResponse> reject(
            @PathVariable Long campaignId,
            @RequestParam(required = false) String reason
    ) {
        return ResponseEntity.ok(adminCampaignService.reject(campaignId, reason));
    }
}
