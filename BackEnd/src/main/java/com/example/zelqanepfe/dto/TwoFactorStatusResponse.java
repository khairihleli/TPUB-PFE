package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** {@code GET /api/me/2fa}. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TwoFactorStatusResponse {

    private boolean enabled;
    private Instant enabledAt;
    /** Mandatory for the user's role. */
    private boolean required;
    private long recoveryCodesRemaining;
    /** A setup was started less than 10 minutes ago. */
    private boolean pendingSetup;
}
