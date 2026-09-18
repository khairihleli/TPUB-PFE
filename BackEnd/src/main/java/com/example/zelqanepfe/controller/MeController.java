package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.LoginHistoryResponse;
import com.example.zelqanepfe.dto.MeResponse;
import com.example.zelqanepfe.dto.MeUpdateRequest;
import com.example.zelqanepfe.dto.PasswordChangeRequest;
import com.example.zelqanepfe.dto.RevokedCountResponse;
import com.example.zelqanepfe.dto.SessionResponse;
import com.example.zelqanepfe.service.MeService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class MeController {

    private final MeService meService;

    @Operation(summary = "Profile of the connected user")
    @GetMapping
    public ResponseEntity<MeResponse> get() {
        return ResponseEntity.ok(meService.get());
    }

    @Operation(summary = "Update my profile (syncs the advertiser company name)")
    @PutMapping
    public ResponseEntity<MeResponse> update(@Valid @RequestBody MeUpdateRequest request) {
        return ResponseEntity.ok(meService.update(request));
    }

    @Operation(summary = "Change my password (other sessions are closed)")
    @PostMapping("/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordChangeRequest request) {
        meService.changePassword(request);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Upload my logo (PNG/JPEG/WEBP, 2 MB max)")
    @PostMapping(value = "/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MeResponse> uploadLogo(@RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok(meService.uploadLogo(file));
    }

    @Operation(summary = "Remove my logo")
    @DeleteMapping("/logo")
    public ResponseEntity<MeResponse> deleteLogo() {
        return ResponseEntity.ok(meService.deleteLogo());
    }

    @Operation(summary = "My active sessions")
    @GetMapping("/sessions")
    public ResponseEntity<List<SessionResponse>> sessions() {
        return ResponseEntity.ok(meService.sessions());
    }

    @Operation(summary = "Close one of my sessions")
    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> revokeSession(@PathVariable String id) {
        meService.revokeSession(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Close all my sessions except the current one")
    @PostMapping("/sessions/revoke-others")
    public ResponseEntity<RevokedCountResponse> revokeOthers() {
        return ResponseEntity.ok(meService.revokeOtherSessions());
    }

    @Operation(summary = "Log out: revoke the current session")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        meService.logout();
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "My login history (newest first)")
    @GetMapping("/login-history")
    public ResponseEntity<List<LoginHistoryResponse>> loginHistory(@RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(meService.loginHistory(limit));
    }
}
