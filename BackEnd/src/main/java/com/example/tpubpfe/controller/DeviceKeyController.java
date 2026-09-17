package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.DeviceKeyIssuedResponse;
import com.example.tpubpfe.dto.DeviceKeyStatusResponse;
import com.example.tpubpfe.service.DeviceKeyService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Player pairing: device keys of the Porteurs (docs/round2-contract.md §3.4). */
@RestController
@RequestMapping("/api/supports")
@RequiredArgsConstructor
public class DeviceKeyController {

    private final DeviceKeyService deviceKeyService;

    @Operation(summary = "Pairing state of every Porteur")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/device-keys")
    public ResponseEntity<List<DeviceKeyStatusResponse>> list() {
        return ResponseEntity.ok(deviceKeyService.list());
    }

    @Operation(summary = "Issue (or rotate) the device key of a Porteur: the key is shown once")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/{id}/device-key")
    public ResponseEntity<DeviceKeyIssuedResponse> issue(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deviceKeyService.issue(id));
    }

    @Operation(summary = "Pairing state of a Porteur")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/{id}/device-key")
    public ResponseEntity<DeviceKeyStatusResponse> status(@PathVariable Long id) {
        return ResponseEntity.ok(deviceKeyService.status(id));
    }

    @Operation(summary = "Revoke the device key of a Porteur (the player is disconnected)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @DeleteMapping("/{id}/device-key")
    public ResponseEntity<Void> revoke(@PathVariable Long id) {
        deviceKeyService.revoke(id);
        return ResponseEntity.noContent().build();
    }
}
