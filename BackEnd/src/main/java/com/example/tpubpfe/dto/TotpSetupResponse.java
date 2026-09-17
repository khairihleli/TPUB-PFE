package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Pending TOTP secret to scan or type into an authenticator app. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TotpSetupResponse {

    /** Base32, upper case, no padding. */
    private String secret;
    private String otpauthUri;
    private Instant expiresAt;
}
