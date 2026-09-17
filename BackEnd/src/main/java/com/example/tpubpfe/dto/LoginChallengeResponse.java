package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Password accepted, second step pending: {@code TOTP_REQUIRED} or {@code TOTP_ENROLMENT_REQUIRED}. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginChallengeResponse implements LoginResponse {

    public static final String TOTP_REQUIRED = "TOTP_REQUIRED";
    public static final String TOTP_ENROLMENT_REQUIRED = "TOTP_ENROLMENT_REQUIRED";

    private String status;
    /** {@code tpc_} + base64url(32 bytes); only its SHA-256 is stored. */
    private String challengeToken;
    private Instant expiresAt;
    private String email;
}
