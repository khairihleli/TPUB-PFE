package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.DiffusionResponse;
import com.example.tpubpfe.service.DiffusionService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/diffusion")
@RequiredArgsConstructor
public class DiffusionController {

    private final DiffusionService diffusionService;

    @Operation(summary = "Get next ad to display on a support (public endpoint for devices)")
    @GetMapping("/next")
    public ResponseEntity<DiffusionResponse> getNext(
            @RequestParam Long supportId,
            @RequestParam(required = false) String zone,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime datetime
    ) {
        return ResponseEntity.ok(diffusionService.getNextAd(supportId, zone, datetime));
    }
}
