ALTER TABLE emergency_messages
    ADD COLUMN approval_status VARCHAR(12) NOT NULL DEFAULT 'APPROUVE',
    ADD COLUMN approvals_required SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE emergency_messages ADD CONSTRAINT chk_emergency_messages_approval_status
    CHECK (approval_status IN ('EN_ATTENTE', 'APPROUVE', 'REFUSE'));
ALTER TABLE emergency_messages DROP CONSTRAINT IF EXISTS chk_emergency_messages_stop_reason;
ALTER TABLE emergency_messages ADD CONSTRAINT chk_emergency_messages_stop_reason
    CHECK (stop_reason IS NULL OR stop_reason IN ('MANUEL', 'AUTO', 'REFUSE'));
UPDATE emergency_messages SET approved_at = created_at WHERE approved_at IS NULL;

CREATE TABLE approvals (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(12) NOT NULL,
    entity_id BIGINT NOT NULL,
    cycle_key VARCHAR(40) NOT NULL,
    approver_user_id BIGINT NOT NULL REFERENCES users(id),
    decision VARCHAR(10) NOT NULL,
    comment VARCHAR(1000),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_approvals_entity_type CHECK (entity_type IN ('CAMPAIGN', 'EMERGENCY')),
    CONSTRAINT chk_approvals_decision CHECK (decision IN ('APPROUVE', 'REFUSE')),
    CONSTRAINT uq_approvals_approver UNIQUE (entity_type, entity_id, cycle_key, approver_user_id)
);
CREATE INDEX idx_approvals_entity ON approvals (entity_type, entity_id, cycle_key);

CREATE TABLE support_presence (
    support_id BIGINT PRIMARY KEY REFERENCES diffusion_supports(id) ON DELETE CASCADE,
    state VARCHAR(10) NOT NULL,
    last_heartbeat_at TIMESTAMPTZ NOT NULL,
    state_changed_at TIMESTAMPTZ NOT NULL,
    last_ip VARCHAR(64),
    player_version VARCHAR(40),
    current_diffusion_log_id BIGINT REFERENCES diffusion_logs(id) ON DELETE SET NULL,
    CONSTRAINT chk_support_presence_state CHECK (state IN ('EN_LIGNE', 'HORS_LIGNE'))
);

CREATE TABLE supervision_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(30) NOT NULL,
    severity VARCHAR(15) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    support_id BIGINT REFERENCES diffusion_supports(id) ON DELETE CASCADE,
    zone_id BIGINT REFERENCES zones(id) ON DELETE CASCADE,
    emergency_id BIGINT REFERENCES emergency_messages(id) ON DELETE CASCADE,
    campaign_id BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_supervision_alerts_type CHECK (alert_type IN ('SUPPORT_OFFLINE', 'ZONE_SATURATION', 'EMERGENCY_PENDING_APPROVAL', 'CAMPAIGN_PENDING_APPROVAL')),
    CONSTRAINT chk_supervision_alerts_severity CHECK (severity IN ('INFO', 'AVERTISSEMENT', 'CRITIQUE'))
);
CREATE INDEX idx_supervision_alerts_open ON supervision_alerts (alert_type, resolved_at);
CREATE INDEX idx_supervision_alerts_created ON supervision_alerts (created_at DESC);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(40) NOT NULL,
    severity VARCHAR(15) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    link VARCHAR(300),
    entity_type VARCHAR(40),
    entity_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    emailed_at TIMESTAMPTZ,
    CONSTRAINT chk_notifications_type CHECK (notification_type IN ('EMERGENCY_APPROVAL_REQUIRED', 'EMERGENCY_BROADCAST', 'EMERGENCY_REFUSED',
        'CAMPAIGN_APPROVAL_REQUIRED', 'SUPPORT_OFFLINE', 'ZONE_SATURATION')),
    CONSTRAINT chk_notifications_severity CHECK (severity IN ('INFO', 'AVERTISSEMENT', 'CRITIQUE'))
);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_user_id, read_at, created_at DESC);
