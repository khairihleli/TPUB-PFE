-- =============================================================================
-- V5 — Accounts, sessions, login history, audit trail, role matrix
--      (completion contract §3, lane C)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users — password change timestamp
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN password_changed_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- user_sessions — one row per issued JWT (claim "sid"), revocable
-- ---------------------------------------------------------------------------
CREATE TABLE user_sessions (
    id             VARCHAR(36)  PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ  NOT NULL,
    revoked_at     TIMESTAMPTZ,
    revoked_reason VARCHAR(30),
    ip_address     VARCHAR(64),
    user_agent     VARCHAR(255),

    CONSTRAINT chk_user_sessions_revoked_reason CHECK (
        revoked_reason IS NULL OR revoked_reason IN
            ('LOGOUT', 'REVOKED_BY_USER', 'REVOKED_BY_ADMIN', 'PASSWORD_CHANGED', 'ACCOUNT_DISABLED')
    )
);

CREATE INDEX idx_user_sessions_user_active ON user_sessions (user_id, revoked_at, expires_at);

-- ---------------------------------------------------------------------------
-- login_history — every login attempt, successful or not
-- ---------------------------------------------------------------------------
CREATE TABLE login_history (
    id             BIGSERIAL    PRIMARY KEY,
    user_id        BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    email          VARCHAR(255) NOT NULL,
    success        BOOLEAN      NOT NULL,
    failure_reason VARCHAR(30),
    ip_address     VARCHAR(64),
    user_agent     VARCHAR(255),
    session_id     VARCHAR(36),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_login_history_failure_reason CHECK (
        failure_reason IS NULL OR failure_reason IN ('BAD_CREDENTIALS', 'ACCOUNT_DISABLED', 'UNKNOWN_USER')
    )
);

CREATE INDEX idx_login_history_user_created ON login_history (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- audit_logs — administrative actions
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id            BIGSERIAL    PRIMARY KEY,
    actor_user_id BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    actor_email   VARCHAR(255),
    actor_role    VARCHAR(30),
    action        VARCHAR(60)  NOT NULL,
    entity_type   VARCHAR(40)  NOT NULL,
    entity_id     VARCHAR(64),
    summary       VARCHAR(500) NOT NULL,
    details       JSONB,
    ip_address    VARCHAR(64),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_entity     ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor      ON audit_logs (actor_user_id);

-- ---------------------------------------------------------------------------
-- roles — permission matrix aligned with the endpoints (CdC §3.1, §8)
--   OPERATEUR  : dashboard, network (read), emergencies (read), diffusion log, statistics
--   SUPERVISEUR: read-only on moderation, reservations, journal, AI rules, users, statistics
-- ---------------------------------------------------------------------------
UPDATE roles SET
    description = 'Accès complet à la plateforme TPUB : validation, gestion et supervision',
    permissions = '["campaigns:read","campaigns:search","campaigns:validate","campaigns:priority","ai:read","ai:rerun","ai:rules:read","ai:rules:write","ai:decisions:read","zones:read","zones:write","supports:read","supports:write","supports:blocks:write","availability:read","estimates:read","reservations:read","reservations:cancel","reservations:conflicts","diffusion:logs","emergency:read","emergency:write","statistics:read","statistics:export","users:read","users:write","clients:validate","sessions:revoke","audit:read","roles:read","profile:read","profile:write"]'::jsonb,
    updated_at = NOW()
WHERE code = 'ADMINISTRATEUR';

UPDATE roles SET
    description = 'Client publicitaire : création de campagnes, réservation et suivi des statistiques',
    permissions = '["campaigns:read:own","campaigns:write:own","media:upload","ai:read:own","ai:check:own","zones:read","supports:read","availability:read","estimates:read","reservations:read:own","reservations:write:own","statistics:read:own","statistics:export:own","profile:read","profile:write"]'::jsonb,
    updated_at = NOW()
WHERE code = 'ANNONCEUR';

UPDATE roles SET
    description = 'Opérateur de diffusion : supervision du réseau, des diffusions et des urgences (lecture)',
    permissions = '["campaigns:read","zones:read","supports:read","availability:read","estimates:read","reservations:read","diffusion:logs","emergency:read","statistics:read","statistics:export","profile:read","profile:write"]'::jsonb,
    updated_at = NOW()
WHERE code = 'OPERATEUR';

UPDATE roles SET
    description = 'Superviseur TPUB : consultation de la modération, des réservations, du journal, des utilisateurs et des statistiques',
    permissions = '["campaigns:read","campaigns:search","ai:read","ai:rules:read","ai:decisions:read","zones:read","supports:read","availability:read","estimates:read","reservations:read","reservations:conflicts","diffusion:logs","emergency:read","statistics:read","statistics:export","users:read","audit:read","roles:read","profile:read","profile:write"]'::jsonb,
    updated_at = NOW()
WHERE code = 'SUPERVISEUR';
