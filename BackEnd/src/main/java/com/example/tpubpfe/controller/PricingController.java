package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.PricingConfigResponse;
import com.example.tpubpfe.service.pricing.DynamicPricingService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Dynamic pricing parameters, so the UI can explain the price (docs/round2-contract.md §4.6). */
@RestController
@RequestMapping("/api/pricing")
@RequiredArgsConstructor
public class PricingController {

    private final DynamicPricingService pricingService;

    @Operation(summary = "Dynamic pricing configuration (hour bands, day multipliers, weights, bounds)")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/config")
    public ResponseEntity<PricingConfigResponse> config() {
        return ResponseEntity.ok(pricingService.config());
    }
}
