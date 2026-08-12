package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.service.AiVerificationService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiVerificationService aiVerificationService;

    @Operation(summary = "Trigger AI content analysis for a campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR')")
    @PostMapping("/check-content/{campaignId}")
    public ResponseEntity<AiReportResponse> checkContent(@PathVariable Long campaignId) {
        return ResponseEntity.ok(aiVerificationService.analyzeCampaign(campaignId));
    }

    @Operation(summary = "Get AI verification report for a campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/report/{campaignId}")
    public ResponseEntity<AiReportResponse> getReport(@PathVariable Long campaignId) {
        return ResponseEntity.ok(aiVerificationService.getReport(campaignId));
    }
}
