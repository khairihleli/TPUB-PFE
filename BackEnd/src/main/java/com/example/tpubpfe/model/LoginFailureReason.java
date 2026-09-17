package com.example.tpubpfe.model;

/** Failure reason of a login attempt (values mirrored by the V5/V7 CHECK constraint). */
public enum LoginFailureReason {
    BAD_CREDENTIALS,
    ACCOUNT_DISABLED,
    UNKNOWN_USER,
    /** Round 2: wrong TOTP or recovery code on the second login step. */
    TOTP_INVALID
}
