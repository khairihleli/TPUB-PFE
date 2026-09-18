package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

import java.time.Instant;

/** Profile of the connected user (GET /api/me). */
@Data
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class MeResponse {

    private Long userId;
    private String email;
    private String nom;
    private String role;
    private String societe;
    private String telephone;
    private String adresse;
    private String logoUrl;
    private Boolean isActive;
    private Instant lastLoginAt;
    private Instant createdAt;
    /** Round 2 (L2). */
    private boolean twoFactorEnabled;
    /** TOTP mandatory for this role ({@code zelqane.security.totp.required-roles}). */
    private boolean twoFactorRequired;
    private boolean mustChangePassword;
    /** Null for staff accounts. */
    private ClientInfo client;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClientInfo {
        private Long clientId;
        private String companyName;
        /** PENDING | VALIDATED | REJECTED | SUSPENDED */
        private String validationStatus;
        private int trustLevel;
    }
}
