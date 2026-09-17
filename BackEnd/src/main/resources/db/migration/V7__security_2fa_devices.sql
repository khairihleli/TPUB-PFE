-- =============================================================================
-- V7 — TOTP two-factor authentication, forced password change, login challenges,
--      player device keys (docs/round2-contract.md §3.6, lane L2 "securite")
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users — forced password change and TOTP state
--   must_change_password defaults to FALSE: an existing local admin keeps working.
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_secret_enc VARCHAR(512),
    ADD COLUMN totp_enabled_at TIMESTAMPTZ,
    ADD COLUMN totp_last_used_step BIGINT,
    ADD COLUMN totp_pending_secret_enc VARCHAR(512),
    ADD COLUMN totp_pending_created_at TIMESTAMPTZ;
ALTER TABLE users ADD CONSTRAINT chk_users_totp_secret CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);

-- ---------------------------------------------------------------------------
-- user_recovery_codes — single-use recovery codes, stored as HMAC-SHA256 hex
-- ---------------------------------------------------------------------------
CREATE TABLE user_recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);
CREATE INDEX idx_user_recovery_codes_user ON user_recovery_codes (user_id);

-- ---------------------------------------------------------------------------
-- login_challenges — second login step (TOTP code or enrolment); token stored as SHA-256 hex
-- ---------------------------------------------------------------------------
CREATE TABLE login_challenges (
    id VARCHAR(36) PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(20) NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    CONSTRAINT chk_login_challenges_purpose CHECK (purpose IN ('TOTP_LOGIN', 'TOTP_ENROLMENT'))
);
CREATE INDEX idx_login_challenges_expires ON login_challenges (expires_at);

ALTER TABLE login_history DROP CONSTRAINT IF EXISTS chk_login_history_failure_reason;
ALTER TABLE login_history ADD CONSTRAINT chk_login_history_failure_reason CHECK (
    failure_reason IS NULL OR failure_reason IN ('BAD_CREDENTIALS', 'ACCOUNT_DISABLED', 'UNKNOWN_USER', 'TOTP_INVALID'));

-- ---------------------------------------------------------------------------
-- support_device_keys — player keys (SHA-256 hex of the key), one active key per support
-- ---------------------------------------------------------------------------
CREATE TABLE support_device_keys (
    id BIGSERIAL PRIMARY KEY,
    support_id BIGINT NOT NULL REFERENCES diffusion_supports(id) ON DELETE CASCADE,
    key_hash CHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(12) NOT NULL,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    last_used_ip VARCHAR(64),
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason VARCHAR(10),
    CONSTRAINT chk_support_device_keys_reason CHECK (revoke_reason IS NULL OR revoke_reason IN ('ROTATED', 'REVOKED'))
);
CREATE UNIQUE INDEX uq_support_device_keys_active ON support_device_keys (support_id) WHERE revoked_at IS NULL;
