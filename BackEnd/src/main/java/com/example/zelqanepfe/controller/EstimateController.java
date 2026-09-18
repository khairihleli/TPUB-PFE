package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.CampaignEstimateResponse;
import com.example.zelqanepfe.dto.EstimateRequest;
import com.example.zelqanepfe.dto.EstimateResponse;
import com.example.zelqanepfe.service.EstimationService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/estimates")
@RequiredArgsConstructor
public class EstimateController {

    private final EstimationService estimationService;

    @Operation(summary = "Estimate views and cost of supports over a window (simulation)")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @PostMapping
    public ResponseEntity<EstimateResponse> compute(@Valid @RequestBody EstimateRequest request) {
        return ResponseEntity.ok(estimationService.compute(request));
    }

    @Operation(summary = "Estimate of a campaign from its live reservations, with budget coverage")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/campaign/{id}")
    public ResponseEntity<CampaignEstimateResponse> campaign(@PathVariable Long id) {
        return ResponseEntity.ok(estimationService.campaign(id));
    }
}
