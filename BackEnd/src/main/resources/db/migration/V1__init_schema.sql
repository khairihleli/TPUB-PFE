-- =============================================================================
-- TPUB v1 — Initial schema
-- Source: Cahier des Charges TPUB v1.3 — Section 9 (Modèle de Données Principal)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- roles — Rôles et permissions
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    code        VARCHAR(30)  NOT NULL,
    description VARCHAR(255),
    permissions JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_roles_name UNIQUE (name),
    CONSTRAINT uq_roles_code UNIQUE (code)
);

CREATE INDEX idx_roles_code ON roles (code);

-- ---------------------------------------------------------------------------
-- users — Comptes utilisateurs et administrateurs
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            BIGSERIAL    PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id       BIGINT       NOT NULL REFERENCES roles (id),
    nom           VARCHAR(150) NOT NULL,
    societe       VARCHAR(200),
    telephone     VARCHAR(30),
    adresse       TEXT,
    logo_url      VARCHAR(500),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_role_id   ON users (role_id);
CREATE INDEX idx_users_is_active ON users (is_active);
CREATE INDEX idx_users_email     ON users (email);

-- ---------------------------------------------------------------------------
-- clients — Informations des annonceurs
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
    id                BIGSERIAL   PRIMARY KEY,
    user_id           BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    company_name      VARCHAR(200),
    trust_level       SMALLINT    NOT NULL DEFAULT 0,
    validation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_clients_user_id UNIQUE (user_id),
    CONSTRAINT chk_clients_trust_level CHECK (trust_level BETWEEN 0 AND 100),
    CONSTRAINT chk_clients_validation_status CHECK (
        validation_status IN ('PENDING', 'VALIDATED', 'REJECTED', 'SUSPENDED')
    )
);

CREATE INDEX idx_clients_validation_status ON clients (validation_status);

-- ---------------------------------------------------------------------------
-- zones — Zones géographiques disponibles
-- ---------------------------------------------------------------------------
CREATE TABLE zones (
    id         BIGSERIAL      PRIMARY KEY,
    name       VARCHAR(150)   NOT NULL,
    latitude   NUMERIC(10, 7) NOT NULL,
    longitude  NUMERIC(10, 7) NOT NULL,
    radius_km  NUMERIC(8, 3),
    geojson    JSONB,
    is_active  BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_zones_latitude  CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT chk_zones_longitude CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_zones_radius    CHECK (radius_km IS NULL OR radius_km > 0)
);

CREATE INDEX idx_zones_name      ON zones (name);
CREATE INDEX idx_zones_is_active ON zones (is_active);
CREATE INDEX idx_zones_geo       ON zones (latitude, longitude);

-- ---------------------------------------------------------------------------
-- campaigns — Campagnes publicitaires
-- ---------------------------------------------------------------------------
CREATE TABLE campaigns (
    id               BIGSERIAL      PRIMARY KEY,
    client_id        BIGINT         NOT NULL REFERENCES clients (id),
    name             VARCHAR(200)   NOT NULL,
    objective        TEXT,
    budget           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    consumed_budget  NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status           VARCHAR(30)    NOT NULL DEFAULT 'BROUILLON',
    ai_status        VARCHAR(30),
    admin_status     VARCHAR(30),
    start_date       DATE,
    end_date         DATE,
    start_time       TIME,
    end_time         TIME,
    estimated_views  BIGINT         NOT NULL DEFAULT 0,
    priority_score   SMALLINT       NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    submitted_at     TIMESTAMPTZ,
    validated_at     TIMESTAMPTZ,

    CONSTRAINT chk_campaigns_budget CHECK (budget >= 0),
    CONSTRAINT chk_campaigns_consumed_budget CHECK (consumed_budget >= 0),
    CONSTRAINT chk_campaigns_dates CHECK (
        start_date IS NULL OR end_date IS NULL OR start_date <= end_date
    ),
    CONSTRAINT chk_campaigns_status CHECK (
        status IN (
            'BROUILLON', 'PENDING_AI_CHECK', 'APPROVED_BY_AI', 'REVIEW_REQUIRED',
            'REJECTED_BY_AI', 'VALIDATED_BY_ADMIN', 'ACTIVE', 'TERMINATED', 'BLOCKED'
        )
    ),
    CONSTRAINT chk_campaigns_ai_status CHECK (
        ai_status IS NULL OR ai_status IN ('APPROVED', 'REVIEW_REQUIRED', 'REJECTED')
    ),
    CONSTRAINT chk_campaigns_admin_status CHECK (
        admin_status IS NULL OR admin_status IN ('PENDING', 'VALIDATED', 'REJECTED')
    )
);

CREATE INDEX idx_campaigns_client_id    ON campaigns (client_id);
CREATE INDEX idx_campaigns_status       ON campaigns (status);
CREATE INDEX idx_campaigns_ai_status    ON campaigns (ai_status);
CREATE INDEX idx_campaigns_admin_status ON campaigns (admin_status);
CREATE INDEX idx_campaigns_dates        ON campaigns (start_date, end_date);
CREATE INDEX idx_campaigns_created_at   ON campaigns (created_at DESC);

-- ---------------------------------------------------------------------------
-- media_files — Images, vidéos et bannières liées aux campagnes
-- ---------------------------------------------------------------------------
CREATE TABLE media_files (
    id               BIGSERIAL    PRIMARY KEY,
    campaign_id      BIGINT       NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    file_name        VARCHAR(255) NOT NULL,
    file_path        VARCHAR(500) NOT NULL,
    file_type        VARCHAR(20)  NOT NULL,
    mime_type        VARCHAR(100),
    file_size_bytes  BIGINT,
    duration_seconds SMALLINT,
    checksum         VARCHAR(128),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_media_files_type CHECK (
        file_type IN ('IMAGE', 'VIDEO', 'BANNER')
    ),
    CONSTRAINT chk_media_files_size CHECK (
        file_size_bytes IS NULL OR file_size_bytes >= 0
    )
);

CREATE INDEX idx_media_files_campaign_id ON media_files (campaign_id);
CREATE INDEX idx_media_files_file_type   ON media_files (file_type);

-- ---------------------------------------------------------------------------
-- campaign_zones — Liaison entre campagnes et zones
-- ---------------------------------------------------------------------------
CREATE TABLE campaign_zones (
    id          BIGSERIAL   PRIMARY KEY,
    campaign_id BIGINT      NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    zone_id     BIGINT      NOT NULL REFERENCES zones (id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_campaign_zones_campaign_zone UNIQUE (campaign_id, zone_id)
);

CREATE INDEX idx_campaign_zones_campaign_id ON campaign_zones (campaign_id);
CREATE INDEX idx_campaign_zones_zone_id     ON campaign_zones (zone_id);

-- ---------------------------------------------------------------------------
-- diffusion_supports — Supports publicitaires physiques ou numériques
-- ---------------------------------------------------------------------------
CREATE TABLE diffusion_supports (
    id                 BIGSERIAL      PRIMARY KEY,
    zone_id            BIGINT         NOT NULL REFERENCES zones (id),
    name               VARCHAR(150)   NOT NULL,
    support_type       VARCHAR(30)    NOT NULL,
    latitude           NUMERIC(10, 7) NOT NULL,
    longitude          NUMERIC(10, 7) NOT NULL,
    technical_status   VARCHAR(20)    NOT NULL DEFAULT 'ACTIF',
    diffusion_capacity SMALLINT       NOT NULL DEFAULT 1,
    visibility_score   NUMERIC(5, 2),
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_diffusion_supports_type CHECK (
        support_type IN ('ECRAN', 'PANNEAU_NUMERIQUE', 'POINT_WIFI', 'APPLICATION', 'SITE_WEB')
    ),
    CONSTRAINT chk_diffusion_supports_status CHECK (
        technical_status IN ('ACTIF', 'INACTIF', 'MAINTENANCE', 'HORS_LIGNE')
    ),
    CONSTRAINT chk_diffusion_supports_capacity CHECK (diffusion_capacity > 0),
    CONSTRAINT chk_diffusion_supports_latitude  CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT chk_diffusion_supports_longitude CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_diffusion_supports_zone_id          ON diffusion_supports (zone_id);
CREATE INDEX idx_diffusion_supports_support_type     ON diffusion_supports (support_type);
CREATE INDEX idx_diffusion_supports_technical_status ON diffusion_supports (technical_status);
CREATE INDEX idx_diffusion_supports_geo              ON diffusion_supports (latitude, longitude);

-- ---------------------------------------------------------------------------
-- support_availability — Disponibilité des supports selon dates et horaires
-- ---------------------------------------------------------------------------
CREATE TABLE support_availability (
    id                  BIGSERIAL   PRIMARY KEY,
    support_id          BIGINT      NOT NULL REFERENCES diffusion_supports (id) ON DELETE CASCADE,
    availability_date   DATE        NOT NULL,
    start_time          TIME        NOT NULL,
    end_time            TIME        NOT NULL,
    availability_status VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_support_availability_times CHECK (start_time < end_time),
    CONSTRAINT chk_support_availability_status CHECK (
        availability_status IN ('DISPONIBLE', 'RESERVE', 'OCCUPE', 'MAINTENANCE', 'HORS_LIGNE')
    )
);

CREATE INDEX idx_support_availability_support_id ON support_availability (support_id);
CREATE INDEX idx_support_availability_date       ON support_availability (availability_date);
CREATE INDEX idx_support_availability_status     ON support_availability (availability_status);
CREATE INDEX idx_support_availability_slot       ON support_availability (support_id, availability_date, start_time, end_time);

-- ---------------------------------------------------------------------------
-- reservations — Réservations des supports pour les campagnes
-- ---------------------------------------------------------------------------
CREATE TABLE reservations (
    id                  BIGSERIAL      PRIMARY KEY,
    campaign_id         BIGINT         NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    zone_id             BIGINT         NOT NULL REFERENCES zones (id),
    support_id          BIGINT         NOT NULL REFERENCES diffusion_supports (id),
    start_date          DATE           NOT NULL,
    end_date            DATE           NOT NULL,
    start_time          TIME           NOT NULL,
    end_time            TIME           NOT NULL,
    availability_status VARCHAR(20)    NOT NULL DEFAULT 'DISPONIBLE',
    reservation_status  VARCHAR(20)    NOT NULL DEFAULT 'TEMPORAIRE',
    estimated_views     BIGINT         NOT NULL DEFAULT 0,
    estimated_cost      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_reservations_dates CHECK (start_date <= end_date),
    CONSTRAINT chk_reservations_times CHECK (start_time < end_time),
    CONSTRAINT chk_reservations_availability_status CHECK (
        availability_status IN ('DISPONIBLE', 'RESERVE', 'OCCUPE', 'MAINTENANCE', 'HORS_LIGNE')
    ),
    CONSTRAINT chk_reservations_status CHECK (
        reservation_status IN ('TEMPORAIRE', 'CONFIRMEE', 'ANNULEE', 'EXPIREE')
    ),
    CONSTRAINT chk_reservations_estimated_views CHECK (estimated_views >= 0),
    CONSTRAINT chk_reservations_estimated_cost CHECK (estimated_cost >= 0)
);

CREATE INDEX idx_reservations_campaign_id        ON reservations (campaign_id);
CREATE INDEX idx_reservations_zone_id            ON reservations (zone_id);
CREATE INDEX idx_reservations_support_id         ON reservations (support_id);
CREATE INDEX idx_reservations_status             ON reservations (reservation_status);
CREATE INDEX idx_reservations_period             ON reservations (support_id, start_date, end_date);
CREATE INDEX idx_reservations_conflict_detection ON reservations (support_id, start_date, end_date, start_time, end_time)
    WHERE reservation_status IN ('TEMPORAIRE', 'CONFIRMEE');

-- ---------------------------------------------------------------------------
-- diffusion_logs — Historique des diffusions réalisées
-- ---------------------------------------------------------------------------
CREATE TABLE diffusion_logs (
    id               BIGSERIAL    PRIMARY KEY,
    support_id       BIGINT       NOT NULL REFERENCES diffusion_supports (id),
    campaign_id      BIGINT       REFERENCES campaigns (id) ON DELETE SET NULL,
    zone_id          BIGINT       REFERENCES zones (id) ON DELETE SET NULL,
    emergency_id     BIGINT,
    content_type     VARCHAR(30)  NOT NULL DEFAULT 'PUBLICITE',
    title            VARCHAR(255),
    media_url        VARCHAR(500),
    duration_seconds SMALLINT,
    priority         SMALLINT     NOT NULL DEFAULT 0,
    diffused_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_diffusion_logs_content_type CHECK (
        content_type IN ('PUBLICITE', 'URGENCE', 'DEFAUT')
    ),
    CONSTRAINT chk_diffusion_logs_duration CHECK (
        duration_seconds IS NULL OR duration_seconds > 0
    )
);

CREATE INDEX idx_diffusion_logs_support_id  ON diffusion_logs (support_id);
CREATE INDEX idx_diffusion_logs_campaign_id ON diffusion_logs (campaign_id);
CREATE INDEX idx_diffusion_logs_zone_id     ON diffusion_logs (zone_id);
CREATE INDEX idx_diffusion_logs_diffused_at ON diffusion_logs (diffused_at DESC);

-- ---------------------------------------------------------------------------
-- ai_moderation_rules — Règles de filtrage utilisées par le système IA
-- ---------------------------------------------------------------------------
CREATE TABLE ai_moderation_rules (
    id          BIGSERIAL    PRIMARY KEY,
    rule_name   VARCHAR(150) NOT NULL,
    rule_type   VARCHAR(50)  NOT NULL,
    pattern     TEXT         NOT NULL,
    severity    VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
    sector      VARCHAR(50),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ai_moderation_rules_name UNIQUE (rule_name),
    CONSTRAINT chk_ai_moderation_rules_severity CHECK (
        severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    )
);

CREATE INDEX idx_ai_moderation_rules_is_active ON ai_moderation_rules (is_active);
CREATE INDEX idx_ai_moderation_rules_rule_type ON ai_moderation_rules (rule_type);

-- ---------------------------------------------------------------------------
-- ai_content_checks — Résultats des analyses IA sur textes, images et vidéos
-- ---------------------------------------------------------------------------
CREATE TABLE ai_content_checks (
    id              BIGSERIAL    PRIMARY KEY,
    campaign_id     BIGINT       NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    media_id        BIGINT       REFERENCES media_files (id) ON DELETE SET NULL,
    content_type    VARCHAR(20)  NOT NULL,
    risk_score      SMALLINT     NOT NULL DEFAULT 0,
    quality_score   SMALLINT     NOT NULL DEFAULT 0,
    detected_issues JSONB        NOT NULL DEFAULT '[]'::jsonb,
    ai_status       VARCHAR(20)  NOT NULL,
    ai_reason       TEXT,
    recommendation  TEXT,
    admin_decision  VARCHAR(20),
    checked_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ai_content_checks_content_type CHECK (
        content_type IN ('TEXTE', 'IMAGE', 'VIDEO', 'MINIATURE')
    ),
    CONSTRAINT chk_ai_content_checks_risk_score CHECK (risk_score BETWEEN 0 AND 100),
    CONSTRAINT chk_ai_content_checks_quality_score CHECK (quality_score BETWEEN 0 AND 100),
    CONSTRAINT chk_ai_content_checks_ai_status CHECK (
        ai_status IN ('APPROVED', 'REVIEW_REQUIRED', 'REJECTED')
    ),
    CONSTRAINT chk_ai_content_checks_admin_decision CHECK (
        admin_decision IS NULL OR admin_decision IN ('VALIDATED', 'REJECTED', 'PENDING')
    )
);

CREATE INDEX idx_ai_content_checks_campaign_id ON ai_content_checks (campaign_id);
CREATE INDEX idx_ai_content_checks_media_id    ON ai_content_checks (media_id);
CREATE INDEX idx_ai_content_checks_ai_status ON ai_content_checks (ai_status);
CREATE INDEX idx_ai_content_checks_checked_at  ON ai_content_checks (checked_at DESC);

-- ---------------------------------------------------------------------------
-- ai_decision_logs — Historique des décisions IA et validations administratives
-- ---------------------------------------------------------------------------
CREATE TABLE ai_decision_logs (
    id                BIGSERIAL   PRIMARY KEY,
    check_id          BIGINT      NOT NULL REFERENCES ai_content_checks (id) ON DELETE CASCADE,
    campaign_id       BIGINT      NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    decision_type     VARCHAR(20) NOT NULL,
    decision          VARCHAR(30) NOT NULL,
    reason            TEXT,
    decided_by_user_id BIGINT     REFERENCES users (id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ai_decision_logs_type CHECK (
        decision_type IN ('AI', 'ADMIN')
    )
);

CREATE INDEX idx_ai_decision_logs_check_id    ON ai_decision_logs (check_id);
CREATE INDEX idx_ai_decision_logs_campaign_id ON ai_decision_logs (campaign_id);
CREATE INDEX idx_ai_decision_logs_created_at  ON ai_decision_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- emergency_messages — Messages urgents prioritaires
-- ---------------------------------------------------------------------------
CREATE TABLE emergency_messages (
    id                BIGSERIAL    PRIMARY KEY,
    title             VARCHAR(200) NOT NULL,
    content           TEXT         NOT NULL,
    zone_id           BIGINT       NOT NULL REFERENCES zones (id),
    start_date        DATE         NOT NULL,
    end_date          DATE         NOT NULL,
    start_time        TIME,
    end_time          TIME,
    duration_seconds  SMALLINT,
    priority          SMALLINT     NOT NULL DEFAULT 1,
    urgency_level     VARCHAR(20)  NOT NULL DEFAULT 'HIGH',
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT      NOT NULL REFERENCES users (id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_emergency_messages_dates CHECK (start_date <= end_date),
    CONSTRAINT chk_emergency_messages_priority CHECK (priority >= 1),
    CONSTRAINT chk_emergency_messages_urgency CHECK (
        urgency_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    )
);

CREATE INDEX idx_emergency_messages_zone_id   ON emergency_messages (zone_id);
CREATE INDEX idx_emergency_messages_is_active ON emergency_messages (is_active);
CREATE INDEX idx_emergency_messages_period    ON emergency_messages (start_date, end_date);

-- Deferred FK from diffusion_logs → emergency_messages
ALTER TABLE diffusion_logs
    ADD CONSTRAINT fk_diffusion_logs_emergency
    FOREIGN KEY (emergency_id) REFERENCES emergency_messages (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- payments_simulation — Simulation des paiements et budgets
-- ---------------------------------------------------------------------------
CREATE TABLE payments_simulation (
    id               BIGSERIAL      PRIMARY KEY,
    campaign_id      BIGINT         NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    client_id        BIGINT         NOT NULL REFERENCES clients (id),
    amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    budget_estimated NUMERIC(14, 2) NOT NULL DEFAULT 0,
    budget_consumed  NUMERIC(14, 2) NOT NULL DEFAULT 0,
    payment_status   VARCHAR(20)    NOT NULL DEFAULT 'SIMULATED',
    simulated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    notes            TEXT,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_payments_simulation_amount CHECK (amount >= 0),
    CONSTRAINT chk_payments_simulation_budget_estimated CHECK (budget_estimated >= 0),
    CONSTRAINT chk_payments_simulation_budget_consumed CHECK (budget_consumed >= 0),
    CONSTRAINT chk_payments_simulation_status CHECK (
        payment_status IN ('SIMULATED', 'PENDING', 'COMPLETED', 'CANCELLED', 'FAILED')
    )
);

CREATE INDEX idx_payments_simulation_campaign_id ON payments_simulation (campaign_id);
CREATE INDEX idx_payments_simulation_client_id   ON payments_simulation (client_id);
CREATE INDEX idx_payments_simulation_status      ON payments_simulation (payment_status);

-- ---------------------------------------------------------------------------
-- statistics — Agrégation des statistiques
-- ---------------------------------------------------------------------------
CREATE TABLE statistics (
    id                      BIGSERIAL      PRIMARY KEY,
    stat_date               DATE           NOT NULL,
    campaign_id             BIGINT         REFERENCES campaigns (id) ON DELETE CASCADE,
    support_id              BIGINT         REFERENCES diffusion_supports (id) ON DELETE SET NULL,
    zone_id                 BIGINT         REFERENCES zones (id) ON DELETE SET NULL,
    total_campaigns         INTEGER        NOT NULL DEFAULT 0,
    active_campaigns        INTEGER        NOT NULL DEFAULT 0,
    pending_campaigns       INTEGER        NOT NULL DEFAULT 0,
    ai_pending_campaigns    INTEGER        NOT NULL DEFAULT 0,
    ai_rejected_campaigns   INTEGER        NOT NULL DEFAULT 0,
    available_supports      INTEGER        NOT NULL DEFAULT 0,
    confirmed_reservations  INTEGER        NOT NULL DEFAULT 0,
    views_count             BIGINT         NOT NULL DEFAULT 0,
    clicks_count            BIGINT         NOT NULL DEFAULT 0,
    interactions_count      BIGINT         NOT NULL DEFAULT 0,
    estimated_budget        NUMERIC(14, 2) NOT NULL DEFAULT 0,
    consumed_budget         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    avg_risk_score          NUMERIC(5, 2),
    avg_quality_score       NUMERIC(5, 2),
    created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_statistics_counts CHECK (
        total_campaigns        >= 0 AND
        active_campaigns       >= 0 AND
        pending_campaigns      >= 0 AND
        ai_pending_campaigns   >= 0 AND
        ai_rejected_campaigns  >= 0 AND
        available_supports     >= 0 AND
        confirmed_reservations >= 0 AND
        views_count            >= 0 AND
        clicks_count           >= 0 AND
        interactions_count     >= 0
    )
);

CREATE INDEX idx_statistics_stat_date   ON statistics (stat_date DESC);
CREATE INDEX idx_statistics_campaign_id ON statistics (campaign_id);
CREATE INDEX idx_statistics_support_id  ON statistics (support_id);
CREATE INDEX idx_statistics_zone_id       ON statistics (zone_id);
CREATE UNIQUE INDEX uq_statistics_daily_global
    ON statistics (stat_date)
    WHERE campaign_id IS NULL AND support_id IS NULL AND zone_id IS NULL;

-- ---------------------------------------------------------------------------
-- Seed — Default roles (Section 3.1)
-- ---------------------------------------------------------------------------
INSERT INTO roles (name, code, description, permissions) VALUES
(
    'Administrateur',
    'ADMINISTRATEUR',
    'Accès complet à la plateforme TPUB : validation, gestion et supervision',
    '["campaigns:read","campaigns:write","campaigns:validate","users:read","users:write","supports:read","supports:write","zones:read","zones:write","ai:read","ai:validate","emergency:write","statistics:read","logs:read"]'::jsonb
),
(
    'Annonceur',
    'ANNONCEUR',
    'Client publicitaire : création de campagnes, réservation et suivi des statistiques',
    '["campaigns:read","campaigns:write","media:upload","reservations:read","reservations:write","statistics:read:own","profile:read","profile:write"]'::jsonb
),
(
    'Opérateur',
    'OPERATEUR',
    'Opérateur de diffusion : supervision des supports et des diffusions en cours',
    '["supports:read","diffusion:read","statistics:read","emergency:read"]'::jsonb
),
(
    'Superviseur',
    'SUPERVISEUR',
    'Superviseur TPUB : consultation, filtres avancés et suivi des réservations',
    '["campaigns:read","supports:read","zones:read","reservations:read","statistics:read","ai:read","logs:read","search:advanced"]'::jsonb
);
