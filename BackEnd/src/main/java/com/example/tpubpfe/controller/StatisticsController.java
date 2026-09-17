package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.DashboardResponse;
import com.example.tpubpfe.dto.StatisticsCampaignResponse;
import com.example.tpubpfe.dto.StatisticsHistoryResponse;
import com.example.tpubpfe.dto.StatisticsMineResponse;
import com.example.tpubpfe.dto.StatisticsViewsResponse;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import com.example.tpubpfe.service.CsvExportService;
import com.example.tpubpfe.service.StatisticsService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
public class StatisticsController {

    private static final MediaType CSV = new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8);

    private final StatisticsService statisticsService;
    private final CsvExportService csvExportService;

    @Operation(summary = "Platform dashboard statistics (staff)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/dashboard")
    public ResponseEntity<DashboardResponse> getDashboard() {
        return ResponseEntity.ok(statisticsService.getDashboard());
    }

    @Operation(summary = "Measured views grouped by day, campaign, support or zone (staff)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/views")
    public ResponseEntity<StatisticsViewsResponse> views(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String groupBy,
            @RequestParam(required = false) Long campaignId,
            @RequestParam(required = false) Long supportId,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) String contentType
    ) {
        return ResponseEntity.ok(statisticsService.views(new StatisticsService.ViewsQuery(from, to, groupBy, campaignId,
                supportId, zoneId, CampaignSearchSpecifications.parseEnums(contentType, DiffusionContentType.class, "contentType"))));
    }

    @Operation(summary = "Statistics of the current advertiser")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @GetMapping("/mine")
    public ResponseEntity<StatisticsMineResponse> mine(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(statisticsService.mine(from, to));
    }

    @Operation(summary = "Statistics of one campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/campaigns/{id}")
    public ResponseEntity<StatisticsCampaignResponse> campaign(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(statisticsService.campaign(id, from, to));
    }

    @Operation(summary = "Daily platform history (staff)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/history")
    public ResponseEntity<List<StatisticsHistoryResponse>> history(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(statisticsService.history(from, to));
    }

    @Operation(summary = "CSV export: type = views | dashboard (staff), mine (advertiser), campaign (readable)")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String groupBy,
            @RequestParam(required = false) Long campaignId
    ) {
        CsvExportService.CsvFile file = csvExportService.export(
                new CsvExportService.ExportQuery(type, from, to, groupBy, campaignId));
        return ResponseEntity.ok()
                .contentType(CSV)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.filename()).build().toString())
                .body(file.content());
    }
}
