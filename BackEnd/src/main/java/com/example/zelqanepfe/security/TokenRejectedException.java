package com.example.zelqanepfe.security;

import lombok.Getter;

/**
 * A bearer token that cannot authenticate the request. {@link #getCode()} is one of {@code TOKEN_INVALID},
 * {@code TOKEN_EXPIRED}, {@code SESSION_REVOKED}, {@code ACCOUNT_DISABLED}.
 */
@Getter
public class TokenRejectedException extends RuntimeException {

    public static final String TOKEN_INVALID = "TOKEN_INVALID";
    public static final String TOKEN_EXPIRED = "TOKEN_EXPIRED";
    public static final String SESSION_REVOKED = "SESSION_REVOKED";
    public static final String ACCOUNT_DISABLED = "ACCOUNT_DISABLED";

    private final String code;

    public TokenRejectedException(String code, String message) {
        super(message);
        this.code = code;
    }

    public static TokenRejectedException invalid() {
        return new TokenRejectedException(TOKEN_INVALID, "Jeton d'authentification invalide. Reconnectez-vous.");
    }

    public static TokenRejectedException expired() {
        return new TokenRejectedException(TOKEN_EXPIRED, "Votre session a expiré. Reconnectez-vous.");
    }

    public static TokenRejectedException revoked() {
        return new TokenRejectedException(SESSION_REVOKED, "Cette session a été fermée. Reconnectez-vous.");
    }

    public static TokenRejectedException disabled() {
        return new TokenRejectedException(ACCOUNT_DISABLED, "Ce compte est désactivé. Contactez ZELQANE.");
    }
}
