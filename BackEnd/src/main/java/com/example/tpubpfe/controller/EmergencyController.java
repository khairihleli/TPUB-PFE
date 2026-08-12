package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.EmergencyRequest;
import com.example.tpubpfe.dto.EmergencyResponse;
import com.example.tpubpfe.service.EmergencyService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/emergency")
@RequiredArgsConstructor
public class EmergencyController {

    private final EmergencyService emergencyService;

    @Operation(summary = "Create a priority emergency message")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping
    public ResponseEntity<EmergencyResponse> create(@Valid @RequestBody EmergencyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(emergencyService.create(request));
    }

    @Operation(summary = "List all emergency messages")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<List<EmergencyResponse>> getAll() {
        return ResponseEntity.ok(emergencyService.getAll());
    }

    @Operation(summary = "Deactivate an emergency message")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{id}/deactivate")
    public ResponseEntity<EmergencyResponse> deactivate(@PathVariable Long id) {
        return ResponseEntity.ok(emergencyService.deactivate(id));
    }
}
