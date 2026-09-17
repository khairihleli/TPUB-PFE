package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String token;
    private String email;
    private String nom;
    private String role;
    private Long userId;
    /** Server-side session bound to the token ({@code sid} claim). */
    private String sessionId;
    private Instant expiresAt;
}
