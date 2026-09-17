package com.example.tpubpfe.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/** A completed authentication: session opened (docs/round2-contract.md §3.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse implements LoginResponse {

    public static final String STATUS_AUTHENTICATED = "AUTHENTICATED";

    @Builder.Default
    private String status = STATUS_AUTHENTICATED;
    private String token;
    private String email;
    private String nom;
    private String role;
    private Long userId;
    /** Server-side session bound to the token ({@code sid} claim). */
    private String sessionId;
    private Instant expiresAt;
    private boolean mustChangePassword;
    private boolean twoFactorEnabled;
    /** True when the second step used a recovery code. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Boolean recoveryCodeUsed;
    /** Only from {@code POST /api/auth/2fa/enable}. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private List<String> recoveryCodes;
}
