package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.ApprovalCommentRequest;
import com.example.zelqanepfe.dto.ApprovalRefusalRequest;
import com.example.zelqanepfe.dto.EmergencyRequest;
import com.example.zelqanepfe.dto.EmergencyResponse;
import com.example.zelqanepfe.service.EmergencyService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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

import java.util.List;

@RestController
@RequestMapping("/api/emergency")
@RequiredArgsConstructor
public class EmergencyController {

    private final EmergencyService emergencyService;

    @Operation(summary = "Create a priority emergency message (zone or map circle, datetime window)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping
    public ResponseEntity<EmergencyResponse> create(@Valid @RequestBody EmergencyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(emergencyService.create(request));
    }

    @Operation(summary = "List emergency messages, newest first (optional state PROGRAMME, EN_COURS, TERMINE, DESACTIVE, EN_ATTENTE_APPROBATION, REFUSE)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<List<EmergencyResponse>> getAll(@RequestParam(required = false) String state) {
        return ResponseEntity.ok(emergencyService.getAll(state));
    }

    @Operation(summary = "Approve a pending emergency message (multi-level approval)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<EmergencyResponse> approve(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) ApprovalCommentRequest request
    ) {
        return ResponseEntity.ok(emergencyService.approve(id, request == null ? null : request.getComment()));
    }

    @Operation(summary = "Refuse a pending emergency message (reason required, never the creator)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{id}/refuse")
    public ResponseEntity<EmergencyResponse> refuse(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) ApprovalRefusalRequest request
    ) {
        return ResponseEntity.ok(emergencyService.refuse(id, request == null ? null : request.getReason()));
    }

    @Operation(summary = "Deactivate an emergency message")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{id}/deactivate")
    public ResponseEntity<EmergencyResponse> deactivate(@PathVariable Long id) {
        return ResponseEntity.ok(emergencyService.deactivate(id));
    }
}
