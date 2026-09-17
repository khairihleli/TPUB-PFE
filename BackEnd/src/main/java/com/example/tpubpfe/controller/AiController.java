package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.AiDashboardResponse;
import com.example.tpubpfe.dto.AiDecisionLogResponse;
import com.example.tpubpfe.dto.AiIssuesResponse;
import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.service.AiDashboardService;
import com.example.tpubpfe.service.AiDecisionQueryService;
import com.example.tpubpfe.service.AiVerificationService;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiVerificationService aiVerificationService;
    private final AiDecisionQueryService aiDecisionQueryService;
    private final AiDashboardService aiDashboardService;

    @Operation(summary = "Run the AI analysis (preview on a draft, re-run for admins)")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR')")
    @PostMapping("/check-content/{campaignId}")
    public ResponseEntity<AiReportResponse> checkContent(@PathVariable Long campaignId) {
        return ResponseEntity.ok(aiVerificationService.checkContent(campaignId));
    }

    @Operation(summary = "Latest AI verification report of a campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/report/{campaignId}")
    public ResponseEntity<AiReportResponse> getReport(@PathVariable Long campaignId) {
        return ResponseEntity.ok(aiVerificationService.getReport(campaignId));
    }

    @Operation(summary = "Problems detected by the latest AI check")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/issues/{campaignId}")
    public ResponseEntity<AiIssuesResponse> getIssues(@PathVariable Long campaignId) {
        return ResponseEntity.ok(aiVerificationService.getIssues(campaignId));
    }

    @Operation(summary = "Every AI check of a campaign, newest first")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/checks/{campaignId}")
    public ResponseEntity<List<AiReportResponse>> getChecks(@PathVariable Long campaignId) {
        return ResponseEntity.ok(aiVerificationService.getChecks(campaignId));
    }

    @Operation(summary = "AI and administrator decisions log")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/decisions")
    public ResponseEntity<PageResponse<AiDecisionLogResponse>> getDecisions(
            @RequestParam(required = false) Long campaignId,
            @RequestParam(required = false) String decisionType,
            @RequestParam(required = false) String decision,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        List<AiDecisionType> types = CampaignSearchSpecifications.parseEnums(decisionType, AiDecisionType.class, "decisionType");
        AiDecisionQueryService.Filter filter = new AiDecisionQueryService.Filter(
                campaignId, types.isEmpty() ? null : types.get(0), decision, from, to);
        return ResponseEntity.ok(aiDecisionQueryService.search(filter, page, size));
    }

    @Operation(summary = "AI dashboard: scores, admin decisions, overrides and disagreements")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/dashboard")
    public ResponseEntity<AiDashboardResponse> getDashboard() {
        return ResponseEntity.ok(aiDashboardService.dashboard());
    }
}
