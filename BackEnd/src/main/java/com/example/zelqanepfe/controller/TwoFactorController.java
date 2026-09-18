package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.RecoveryCodesResponse;
import com.example.zelqanepfe.dto.TotpSetupResponse;
import com.example.zelqanepfe.dto.TwoFactorRequests;
import com.example.zelqanepfe.dto.TwoFactorStatusResponse;
import com.example.zelqanepfe.service.SecurityUtils;
import com.example.zelqanepfe.service.TwoFactorService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Self-service two-factor authentication ({@code /api/me/2fa}, docs/round2-contract.md §3.3). */
@RestController
@RequestMapping("/api/me/2fa")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class TwoFactorController {

    private final TwoFactorService twoFactorService;

    @Operation(summary = "My 2FA status")
    @GetMapping
    public ResponseEntity<TwoFactorStatusResponse> status() {
        return ResponseEntity.ok(twoFactorService.statusOf(SecurityUtils.getCurrentUser().getId()));
    }

    @Operation(summary = "Start the 2FA setup (pending secret valid 10 minutes)")
    @PostMapping("/setup")
    public ResponseEntity<TotpSetupResponse> setup() {
        return ResponseEntity.ok(twoFactorService.beginSetupFor(SecurityUtils.getCurrentUser().getId()));
    }

    @Operation(summary = "Confirm the first code and enable 2FA (returns recovery codes once)")
    @PostMapping("/enable")
    public ResponseEntity<RecoveryCodesResponse> enable(@Valid @RequestBody TwoFactorRequests.Code request) {
        return ResponseEntity.ok(RecoveryCodesResponse.builder()
                .recoveryCodes(twoFactorService.enableFor(SecurityUtils.getCurrentUser().getId(), request.getCode()))
                .build());
    }

    @Operation(summary = "Disable 2FA (password + code; other sessions are closed)")
    @PostMapping("/disable")
    public ResponseEntity<Void> disable(@Valid @RequestBody TwoFactorRequests.Disable request) {
        twoFactorService.disableFor(SecurityUtils.getCurrentUser().getId(), request.getPassword(), request.getCode(),
                SecurityUtils.currentSessionId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Regenerate recovery codes (TOTP code required)")
    @PostMapping("/recovery-codes")
    public ResponseEntity<RecoveryCodesResponse> regenerate(@Valid @RequestBody TwoFactorRequests.Code request) {
        return ResponseEntity.ok(RecoveryCodesResponse.builder()
                .recoveryCodes(twoFactorService.regenerateRecoveryCodesFor(SecurityUtils.getCurrentUser().getId(),
                        request.getCode()))
                .build());
    }
}
