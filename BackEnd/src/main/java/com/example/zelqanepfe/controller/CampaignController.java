package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.CampaignRequest;
import com.example.zelqanepfe.dto.CampaignResponse;
import com.example.zelqanepfe.dto.CampaignZoneRequest;
import com.example.zelqanepfe.dto.CampaignZoneResponse;
import com.example.zelqanepfe.dto.CampaignZonesUpdateResponse;
import com.example.zelqanepfe.dto.DuplicateRequest;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.model.CampaignAiStatus;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.service.CampaignDuplicationService;
import com.example.zelqanepfe.service.CampaignSearchSpecifications;
import com.example.zelqanepfe.service.CampaignService;
import com.example.zelqanepfe.service.CampaignZoneService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/campaigns")
@RequiredArgsConstructor
public class CampaignController {

    private final CampaignService campaignService;
    private final CampaignZoneService campaignZoneService;
    private final CampaignDuplicationService campaignDuplicationService;

    @Operation(summary = "Create a new campaign (BROUILLON)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping
    public ResponseEntity<CampaignResponse> create(@Valid @RequestBody CampaignRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(campaignService.create(request));
    }

    @Operation(summary = "Search campaigns (admin/supervisor), paginated")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping
    public ResponseEntity<PageResponse<CampaignResponse>> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String aiStatus,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String supportType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort
    ) {
        CampaignSearchSpecifications.Filter filter = new CampaignSearchSpecifications.Filter(
                q, client, clientId, zoneId,
                CampaignSearchSpecifications.parseEnums(status, CampaignStatus.class, "status"),
                CampaignSearchSpecifications.parseEnums(aiStatus, CampaignAiStatus.class, "aiStatus"),
                from, to,
                CampaignSearchSpecifications.parseEnums(supportType, SupportType.class, "supportType"));
        return ResponseEntity.ok(campaignService.search(filter, page, size, sort));
    }

    @Operation(summary = "Get my campaigns (newest first, optional filters)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @GetMapping("/mine")
    public ResponseEntity<List<CampaignResponse>> getMine(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String aiStatus,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long zoneId
    ) {
        CampaignSearchSpecifications.Filter filter = new CampaignSearchSpecifications.Filter(
                q, null, null, zoneId,
                CampaignSearchSpecifications.parseEnums(status, CampaignStatus.class, "status"),
                CampaignSearchSpecifications.parseEnums(aiStatus, CampaignAiStatus.class, "aiStatus"),
                from, to, List.of());
        return ResponseEntity.ok(campaignService.getMine(filter));
    }

    @Operation(summary = "Get campaign by ID")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/{id}")
    public ResponseEntity<CampaignResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(campaignService.getById(id));
    }

    @Operation(summary = "Update a campaign (REJECTED_BY_AI / BLOCKED campaigns are reopened as BROUILLON)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PutMapping("/{id}")
    public ResponseEntity<CampaignResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody CampaignRequest request
    ) {
        return ResponseEntity.ok(campaignService.update(id, request));
    }

    @Operation(summary = "Delete a campaign")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        campaignService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Reopen a refused campaign as BROUILLON")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping("/{id}/reopen")
    public ResponseEntity<CampaignResponse> reopen(@PathVariable Long id) {
        return ResponseEntity.ok(campaignService.reopen(id));
    }

    @Operation(summary = "Submit a campaign: completeness checks then synchronous AI analysis")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping("/{id}/submit")
    public ResponseEntity<CampaignResponse> submit(@PathVariable Long id) {
        return ResponseEntity.ok(campaignService.submit(id));
    }

    @Operation(summary = "Duplicate a campaign as a new BROUILLON")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<CampaignResponse> duplicate(
            @PathVariable Long id,
            @RequestBody(required = false) DuplicateRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(campaignDuplicationService.duplicate(id, request));
    }

    @Operation(summary = "List the targeting circles of a campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/{id}/zones")
    public ResponseEntity<List<CampaignZoneResponse>> getZones(@PathVariable Long id) {
        return ResponseEntity.ok(campaignZoneService.getZones(id));
    }

    @Operation(summary = "Replace the targeting circles of a campaign (1 to 5)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PutMapping("/{id}/zones")
    public ResponseEntity<CampaignZonesUpdateResponse> setZones(
            @PathVariable Long id,
            @Valid @RequestBody CampaignZoneRequest request
    ) {
        return ResponseEntity.ok(campaignZoneService.setZones(id, request));
    }
}
