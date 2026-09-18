package com.example.zelqanepfe.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Request bodies of the 2FA endpoints (docs/round2-contract.md §3.3). */
public final class TwoFactorRequests {

    private TwoFactorRequests() {
    }

    /** {@code POST /api/auth/2fa/setup}. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Challenge {
        @NotBlank
        @Size(max = 100)
        private String challengeToken;
    }

    /** {@code POST /api/auth/login/verify} and {@code POST /api/auth/2fa/enable}. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChallengeCode {
        @NotBlank
        @Size(max = 100)
        private String challengeToken;
        @NotBlank
        @Size(max = 20)
        private String code;
    }

    /** {@code POST /api/me/2fa/enable} and {@code POST /api/me/2fa/recovery-codes}. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Code {
        @NotBlank
        @Size(max = 20)
        private String code;
    }

    /** {@code POST /api/me/2fa/disable}. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Disable {
        @NotBlank
        @Size(max = 100)
        private String password;
        @NotBlank
        @Size(max = 20)
        private String code;
    }
}
