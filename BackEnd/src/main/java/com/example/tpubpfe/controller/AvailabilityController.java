package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.AvailabilityResponse;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.service.AvailabilityService;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
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

@RestController
@RequestMapping("/api/availability")
@RequiredArgsConstructor
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    @Operation(summary = "Availability of supports for a window: target = campaignId, or lat+lng+radiusKm, or zoneId")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<AvailabilityResponse> search(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false) Long campaignId,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) String supportType,
            @RequestParam(required = false) String status
    ) {
        return ResponseEntity.ok(availabilityService.search(new AvailabilityService.Query(
                startDate, endDate,
                RequestParams.time(startTime, "startTime"), RequestParams.time(endTime, "endTime"),
                campaignId, lat, lng, radiusKm, zoneId,
                CampaignSearchSpecifications.parseEnums(supportType, SupportType.class, "supportType"),
                CampaignSearchSpecifications.parseEnums(status, AvailabilityStatus.class, "status"))));
    }
}
