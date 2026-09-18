package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.AuthResponse;
import com.example.zelqanepfe.dto.LoginRequest;
import com.example.zelqanepfe.dto.LoginResponse;
import com.example.zelqanepfe.dto.RegisterRequest;
import com.example.zelqanepfe.dto.TotpSetupResponse;
import com.example.zelqanepfe.dto.TwoFactorRequests;
import com.example.zelqanepfe.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Operation(summary = "Register a new advertiser account")
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @Operation(summary = "Login: AUTHENTICATED (token) or a TOTP challenge (TOTP_REQUIRED / TOTP_ENROLMENT_REQUIRED)")
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @Operation(summary = "Login second step: TOTP code or recovery code")
    @PostMapping("/login/verify")
    public ResponseEntity<AuthResponse> verify(@Valid @RequestBody TwoFactorRequests.ChallengeCode request) {
        return ResponseEntity.ok(authService.verify(request.getChallengeToken(), request.getCode()));
    }

    @Operation(summary = "Mandatory 2FA enrolment during login: generate the secret")
    @PostMapping("/2fa/setup")
    public ResponseEntity<TotpSetupResponse> enrolmentSetup(@Valid @RequestBody TwoFactorRequests.Challenge request) {
        return ResponseEntity.ok(authService.enrolmentSetup(request.getChallengeToken()));
    }

    @Operation(summary = "Mandatory 2FA enrolment during login: confirm the code and open the session")
    @PostMapping("/2fa/enable")
    public ResponseEntity<AuthResponse> enrolmentEnable(@Valid @RequestBody TwoFactorRequests.ChallengeCode request) {
        return ResponseEntity.ok(authService.enrolmentEnable(request.getChallengeToken(), request.getCode()));
    }
}
