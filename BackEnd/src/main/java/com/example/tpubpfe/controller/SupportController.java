package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.SupportAvailabilitySlot;
import com.example.tpubpfe.dto.SupportBlockRequest;
import com.example.tpubpfe.dto.SupportBlockResponse;
import com.example.tpubpfe.dto.SupportRequest;
import com.example.tpubpfe.dto.SupportResponse;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import com.example.tpubpfe.service.SupportBlockService;
import com.example.tpubpfe.service.SupportService;
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
@RequestMapping("/api/supports")
@RequiredArgsConstructor
public class SupportController {

    private final SupportService supportService;
    private final SupportBlockService supportBlockService;

    @Operation(summary = "Create a diffusion support")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping
    public ResponseEntity<SupportResponse> create(@Valid @RequestBody SupportRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(supportService.create(request));
    }

    @Operation(summary = "List supports (optional comma-list filters zoneId, supportType, technicalStatus)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR', 'ANNONCEUR')")
    @GetMapping
    public ResponseEntity<List<SupportResponse>> getAll(
            @RequestParam(required = false) String zoneId,
            @RequestParam(required = false) String supportType,
            @RequestParam(required = false) String technicalStatus
    ) {
        return ResponseEntity.ok(supportService.getAll(
                RequestParams.longs(zoneId, "zoneId"),
                CampaignSearchSpecifications.parseEnums(supportType, SupportType.class, "supportType"),
                CampaignSearchSpecifications.parseEnums(technicalStatus, TechnicalStatus.class, "technicalStatus")));
    }

    @Operation(summary = "List supports by zone")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR', 'ANNONCEUR')")
    @GetMapping("/zone/{zoneId}")
    public ResponseEntity<List<SupportResponse>> getByZone(@PathVariable Long zoneId) {
        return ResponseEntity.ok(supportService.getByZone(zoneId));
    }

    @Operation(summary = "Get support by ID")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR', 'ANNONCEUR')")
    @GetMapping("/{id}")
    public ResponseEntity<SupportResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(supportService.getById(id));
    }

    @Operation(summary = "Booked periods and unavailability blocks of a support overlapping [from, to]")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR', 'ANNONCEUR')")
    @GetMapping("/{id}/availability")
    public ResponseEntity<List<SupportAvailabilitySlot>> getAvailability(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime
    ) {
        return ResponseEntity.ok(supportService.getAvailability(id, from, to,
                RequestParams.time(startTime, "startTime"), RequestParams.time(endTime, "endTime")));
    }

    @Operation(summary = "Update a support")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PutMapping("/{id}")
    public ResponseEntity<SupportResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody SupportRequest request
    ) {
        return ResponseEntity.ok(supportService.update(id, request));
    }

    @Operation(summary = "List unavailability blocks of a support")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR', 'ANNONCEUR')")
    @GetMapping("/{id}/blocks")
    public ResponseEntity<List<SupportBlockResponse>> getBlocks(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(supportBlockService.list(id, from, to));
    }

    @Operation(summary = "Create unavailability blocks (one per day) on a support")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{id}/blocks")
    public ResponseEntity<List<SupportBlockResponse>> createBlocks(
            @PathVariable Long id,
            @Valid @RequestBody SupportBlockRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(supportBlockService.create(id, request));
    }

    @Operation(summary = "Delete an unavailability block")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @DeleteMapping("/{id}/blocks/{blockId}")
    public ResponseEntity<Void> deleteBlock(@PathVariable Long id, @PathVariable Long blockId) {
        supportBlockService.delete(id, blockId);
        return ResponseEntity.noContent().build();
    }
}
