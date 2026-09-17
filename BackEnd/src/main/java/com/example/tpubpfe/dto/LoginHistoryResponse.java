package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One login attempt. {@code failureReason}: BAD_CREDENTIALS | ACCOUNT_DISABLED | UNKNOWN_USER | null. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginHistoryResponse {

    private Long id;
    private String email;
    private boolean success;
    private String failureReason;
    private String ipAddress;
    private String userAgent;
    private Instant createdAt;
}
