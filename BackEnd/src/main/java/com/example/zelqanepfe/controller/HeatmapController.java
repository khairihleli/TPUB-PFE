package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.DemandHeatmapResponse;
import com.example.zelqanepfe.dto.HeatmapResponse;
import com.example.zelqanepfe.model.DiffusionContentType;
import com.example.zelqanepfe.service.CampaignSearchSpecifications;
import com.example.zelqanepfe.service.HeatmapService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** Heatmap points (docs/round2-contract.md §4.5). */
@RestController
@RequestMapping("/api/heatmap")
@RequiredArgsConstructor
public class HeatmapController {

    private final HeatmapService heatmapService;

    @Operation(summary = "Diffusions per support over a date range (heatmap points)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/diffusions")
    public ResponseEntity<HeatmapResponse> diffusions(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String contentType,
            @RequestParam(required = false) Long zoneId
    ) {
        return ResponseEntity.ok(heatmapService.diffusions(from, to,
                CampaignSearchSpecifications.parseEnums(contentType, DiffusionContentType.class, "contentType"), zoneId));
    }

    @Operation(summary = "Reserved slot-hours per support and campaign targets over a date range")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/demand")
    public ResponseEntity<DemandHeatmapResponse> demand(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long zoneId
    ) {
        return ResponseEntity.ok(heatmapService.demand(from, to, zoneId));
    }

    @Operation(summary = "Occupancy of ACTIF supports on a window, without campaign or client data (wizard)")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/demand/public")
    public ResponseEntity<HeatmapResponse> demandPublic(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime
    ) {
        return ResponseEntity.ok(heatmapService.demandPublic(startDate, endDate,
                RequestParams.time(startTime, "startTime"), RequestParams.time(endTime, "endTime")));
    }
}
