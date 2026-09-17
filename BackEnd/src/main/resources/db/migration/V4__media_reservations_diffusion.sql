-- =============================================================================
-- V4 — Media, reservations, availability blocks, diffusion engine, emergencies
--      (completion contract §3, lane B)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- media_files — dimensions and display order
-- ---------------------------------------------------------------------------
ALTER TABLE media_files
    ADD COLUMN width_px   INTEGER,
    ADD COLUMN height_px  INTEGER,
    ADD COLUMN sort_order SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE media_files
    ADD CONSTRAINT chk_media_files_duration
        CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 600);

CREATE INDEX IF NOT EXISTS idx_media_files_checksum ON media_files (checksum);

-- ---------------------------------------------------------------------------
-- diffusion_supports — visibility score bounds
-- ---------------------------------------------------------------------------
ALTER TABLE diffusion_supports
    ADD CONSTRAINT chk_diffusion_supports_visibility
        CHECK (visibility_score IS NULL OR visibility_score BETWEEN 0 AND 100);

-- ---------------------------------------------------------------------------
-- campaigns / payments_simulation — per-diffusion consumption needs 4 decimals
-- ---------------------------------------------------------------------------
ALTER TABLE campaigns
    ALTER COLUMN consumed_budget TYPE NUMERIC(16, 4);

ALTER TABLE payments_simulation
    ALTER COLUMN budget_consumed TYPE NUMERIC(16, 4);

CREATE INDEX IF NOT EXISTS idx_payments_simulation_campaign_created
    ON payments_simulation (campaign_id, created_at);

-- ---------------------------------------------------------------------------
-- reservations — cancellation and expiry tracking
-- ---------------------------------------------------------------------------
ALTER TABLE reservations
    ADD COLUMN cancelled_at         TIMESTAMPTZ,
    ADD COLUMN cancel_reason        VARCHAR(255),
    ADD COLUMN cancelled_by_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN expired_at           TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reservations_support_status_period
    ON reservations (support_id, reservation_status, start_date, end_date);

-- ---------------------------------------------------------------------------
-- diffusion_logs — reservation link and simulated cost
-- ---------------------------------------------------------------------------
ALTER TABLE diffusion_logs
    ADD COLUMN reservation_id BIGINT REFERENCES reservations (id) ON DELETE SET NULL,
    ADD COLUMN cost           NUMERIC(10, 4) NOT NULL DEFAULT 0;

ALTER TABLE diffusion_logs
    ADD CONSTRAINT chk_diffusion_logs_cost CHECK (cost >= 0);

CREATE INDEX IF NOT EXISTS idx_diffusion_logs_support_diffused  ON diffusion_logs (support_id, diffused_at);
CREATE INDEX IF NOT EXISTS idx_diffusion_logs_campaign_diffused ON diffusion_logs (campaign_id, diffused_at);
CREATE INDEX IF NOT EXISTS idx_diffusion_logs_type_diffused     ON diffusion_logs (content_type, diffused_at);

-- ---------------------------------------------------------------------------
-- diffusion_interactions — clicks and interactions on a diffusion
-- ---------------------------------------------------------------------------
CREATE TABLE diffusion_interactions (
    id               BIGSERIAL   PRIMARY KEY,
    diffusion_log_id BIGINT      NOT NULL REFERENCES diffusion_logs (id) ON DELETE CASCADE,
    campaign_id      BIGINT      REFERENCES campaigns (id) ON DELETE SET NULL,
    support_id       BIGINT      NOT NULL REFERENCES diffusion_supports (id),
    interaction_type VARCHAR(20) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_diffusion_interactions_type CHECK (interaction_type IN ('CLIC', 'INTERACTION')),
    CONSTRAINT uq_diffusion_interactions_log_type UNIQUE (diffusion_log_id, interaction_type)
);

CREATE INDEX idx_diffusion_interactions_campaign_id ON diffusion_interactions (campaign_id);

-- ---------------------------------------------------------------------------
-- emergency_messages — map circle and stop tracking
-- ---------------------------------------------------------------------------
ALTER TABLE emergency_messages
    ADD COLUMN latitude    NUMERIC(10, 7),
    ADD COLUMN longitude   NUMERIC(10, 7),
    ADD COLUMN radius_km   NUMERIC(8, 3),
    ADD COLUMN stopped_at  TIMESTAMPTZ,
    ADD COLUMN stop_reason VARCHAR(20);

ALTER TABLE emergency_messages
    ADD CONSTRAINT chk_emergency_messages_stop_reason
        CHECK (stop_reason IS NULL OR stop_reason IN ('MANUEL', 'AUTO')),
    ADD CONSTRAINT chk_emergency_messages_circle
        CHECK ((latitude IS NULL AND longitude IS NULL AND radius_km IS NULL)
            OR (latitude IS NOT NULL AND longitude IS NOT NULL AND radius_km > 0)),
    ADD CONSTRAINT chk_emergency_messages_duration
        CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 5 AND 120);

-- ---------------------------------------------------------------------------
-- support_availability — unavailability blocks created by administrators
-- ---------------------------------------------------------------------------
ALTER TABLE support_availability
    ADD COLUMN reason             VARCHAR(255),
    ADD COLUMN created_by_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_availability_support_date
    ON support_availability (support_id, availability_date);

-- ---------------------------------------------------------------------------
-- statistics — one platform row per day
-- V1 already created the equivalent partial unique index uq_statistics_daily_global
-- (stat_date WHERE campaign_id IS NULL AND support_id IS NULL AND zone_id IS NULL).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_statistics_daily_global
    ON statistics (stat_date)
    WHERE campaign_id IS NULL AND support_id IS NULL AND zone_id IS NULL;
