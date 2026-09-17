package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** An active login session (GET /api/me/sessions). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionResponse {

    private String id;
    private Instant createdAt;
    private Instant lastSeenAt;
    private Instant expiresAt;
    private String ipAddress;
    private String userAgent;
    private boolean current;
}
