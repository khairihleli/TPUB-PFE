package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.ZoneRecommendationResponse;
import com.example.tpubpfe.dto.ZoneRequest;
import com.example.tpubpfe.dto.ZoneResponse;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import com.example.tpubpfe.service.ZoneRecommendationService;
import com.example.tpubpfe.service.ZoneService;
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
@RequestMapping("/api/zones")
@RequiredArgsConstructor
public class ZoneController {

    private final ZoneService zoneService;
    private final ZoneRecommendationService zoneRecommendationService;

    @Operation(summary = "Create a geographic zone")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping
    public ResponseEntity<ZoneResponse> create(@Valid @RequestBody ZoneRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(zoneService.create(request));
    }

    @Operation(summary = "List all zones")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<List<ZoneResponse>> getAll() {
        return ResponseEntity.ok(zoneService.getAll());
    }

    @Operation(summary = "List active zones")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/active")
    public ResponseEntity<List<ZoneResponse>> getActive() {
        return ResponseEntity.ok(zoneService.getActive());
    }

    @Operation(summary = "Recommended zones for a window (audience, availability, recent activity)")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/recommendations")
    public ResponseEntity<List<ZoneRecommendationResponse>> recommendations(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false) String supportType,
            @RequestParam(required = false) Integer limit
    ) {
        return ResponseEntity.ok(zoneRecommendationService.recommend(startDate, endDate,
                RequestParams.time(startTime, "startTime"), RequestParams.time(endTime, "endTime"),
                CampaignSearchSpecifications.parseEnums(supportType, SupportType.class, "supportType"), limit));
    }

    @Operation(summary = "Get zone by ID")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/{id}")
    public ResponseEntity<ZoneResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(zoneService.getById(id));
    }

    @Operation(summary = "Update a zone")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PutMapping("/{id}")
    public ResponseEntity<ZoneResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody ZoneRequest request
    ) {
        return ResponseEntity.ok(zoneService.update(id, request));
    }

    @Operation(summary = "Delete a zone (409 ZONE_IN_USE when referenced)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        zoneService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
