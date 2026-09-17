package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.ReservationBatchRequest;
import com.example.tpubpfe.dto.ReservationCancelRequest;
import com.example.tpubpfe.dto.ReservationConflictResponse;
import com.example.tpubpfe.dto.ReservationRequest;
import com.example.tpubpfe.dto.ReservationResponse;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import com.example.tpubpfe.service.ReservationService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationService reservationService;

    @Operation(summary = "Create a temporary support reservation")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping
    public ResponseEntity<ReservationResponse> create(@Valid @RequestBody ReservationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reservationService.create(request));
    }

    @Operation(summary = "Reserve several supports at once (all or nothing)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping("/batch")
    public ResponseEntity<List<ReservationResponse>> createBatch(@Valid @RequestBody ReservationBatchRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reservationService.createBatch(request));
    }

    @Operation(summary = "Cancel a reservation")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR')")
    @PostMapping("/{id}/cancel")
    public ResponseEntity<ReservationResponse> cancel(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) ReservationCancelRequest request
    ) {
        return ResponseEntity.ok(reservationService.cancel(id, request != null ? request.getReason() : null));
    }

    @Operation(summary = "Search reservations (paginated)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<PageResponse<ReservationResponse>> search(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long campaignId,
            @RequestParam(required = false) Long supportId,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort
    ) {
        ReservationService.Filter filter = new ReservationService.Filter(
                CampaignSearchSpecifications.parseEnums(status, ReservationStatus.class, "status"),
                campaignId, supportId, zoneId, clientId, from, to);
        return ResponseEntity.ok(reservationService.search(filter, page, size, sort));
    }

    @Operation(summary = "My reservations (advertiser)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @GetMapping("/mine")
    public ResponseEntity<List<ReservationResponse>> getMine(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long campaignId
    ) {
        return ResponseEntity.ok(reservationService.getMine(
                CampaignSearchSpecifications.parseEnums(status, ReservationStatus.class, "status"), campaignId));
    }

    @Operation(summary = "Over-booked (CONFLIT) and fully booked (SATURE) reservation sets")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/conflicts")
    public ResponseEntity<List<ReservationConflictResponse>> conflicts(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) Long supportId
    ) {
        return ResponseEntity.ok(reservationService.conflicts(from, to, zoneId, supportId));
    }

    @Operation(summary = "List reservations for a campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/campaign/{campaignId}")
    public ResponseEntity<List<ReservationResponse>> getByCampaign(@PathVariable Long campaignId) {
        return ResponseEntity.ok(reservationService.getByCampaign(campaignId));
    }
}
