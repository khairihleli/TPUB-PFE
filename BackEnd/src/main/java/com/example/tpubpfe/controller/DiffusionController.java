package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.DiffusionLogResponse;
import com.example.tpubpfe.dto.DiffusionResponse;
import com.example.tpubpfe.dto.InteractionRequest;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import com.example.tpubpfe.service.DiffusionLogQueryService;
import com.example.tpubpfe.service.DiffusionService;
import com.example.tpubpfe.service.InteractionService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/diffusion")
@RequiredArgsConstructor
public class DiffusionController {

    private final DiffusionService diffusionService;
    private final InteractionService interactionService;
    private final DiffusionLogQueryService diffusionLogQueryService;

    @Operation(summary = "Get next content to display on a support (public endpoint for devices; datetime defaults to now)")
    @GetMapping("/next")
    public ResponseEntity<DiffusionResponse> getNext(
            @RequestParam(required = false) Long supportId,
            @RequestParam(required = false) String zone,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime datetime
    ) {
        return ResponseEntity.ok(diffusionService.getNextAd(supportId, zone, datetime));
    }

    @Operation(summary = "Record a click or interaction on a diffused ad (public, idempotent)")
    @PostMapping("/interactions")
    public ResponseEntity<Void> interaction(@Valid @RequestBody InteractionRequest request) {
        interactionService.record(request);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Diffusion journal (paginated, newest first)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/logs")
    public ResponseEntity<PageResponse<DiffusionLogResponse>> logs(
            @RequestParam(required = false) Long supportId,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) Long campaignId,
            @RequestParam(required = false) String contentType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(diffusionLogQueryService.search(new DiffusionLogQueryService.Filter(
                supportId, zoneId, campaignId,
                CampaignSearchSpecifications.parseEnums(contentType, DiffusionContentType.class, "contentType"),
                from, to), page, size));
    }
}
