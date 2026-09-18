package com.example.zelqanepfe.model;

/** Why a {@link UserSession} was revoked (values mirrored by the V5 CHECK constraint). */
public enum SessionRevokeReason {
    LOGOUT,
    REVOKED_BY_USER,
    REVOKED_BY_ADMIN,
    PASSWORD_CHANGED,
    ACCOUNT_DISABLED
}
