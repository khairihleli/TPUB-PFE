package com.example.zelqanepfe.dto;

/** {@code POST /api/auth/login}: either {@link AuthResponse} or {@link LoginChallengeResponse}, told apart by {@code status}. */
public interface LoginResponse {

    String getStatus();
}
