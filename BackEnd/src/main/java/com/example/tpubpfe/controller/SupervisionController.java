package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.SupervisionAlertResponse;
import com.example.tpubpfe.dto.SupervisionSnapshot;
import com.example.tpubpfe.service.supervision.SupervisionService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Supervision snapshot and alerts (docs/round2-contract.md §5.3). */
@RestController
@RequestMapping("/api/supervision")
@RequiredArgsConstructor
public class SupervisionController {

    private final SupervisionService supervisionService;

    @Operation(summary = "Supervision snapshot (JSON fallback of the SSE stream)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/snapshot")
    public ResponseEntity<SupervisionSnapshot> snapshot() {
        return ResponseEntity.ok(supervisionService.snapshot());
    }

    @Operation(summary = "Alert journal (status OUVERTE | RESOLUE | TOUTES)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/alerts")
    public ResponseEntity<PageResponse<SupervisionAlertResponse>> alerts(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(supervisionService.alerts(status, type, page, size));
    }

    @Operation(summary = "Acknowledge an alert")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @PostMapping("/alerts/{id}/acknowledge")
    public ResponseEntity<SupervisionAlertResponse> acknowledge(@PathVariable Long id) {
        return ResponseEntity.ok(supervisionService.acknowledge(id));
    }
}
