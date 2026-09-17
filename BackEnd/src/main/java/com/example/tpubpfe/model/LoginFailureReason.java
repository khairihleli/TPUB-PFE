package com.example.tpubpfe.model;

/** Failure reason of a login attempt (values mirrored by the V5 CHECK constraint). */
public enum LoginFailureReason {
    BAD_CREDENTIALS,
    ACCOUNT_DISABLED,
    UNKNOWN_USER
}
