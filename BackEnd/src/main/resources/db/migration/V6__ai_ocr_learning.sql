-- Round 2 · L1 ia-ocr (docs/round2-contract.md §2.8): calibration versions, admin feedback, provider model.
ALTER TABLE ai_content_checks
    ADD COLUMN calibration_version INTEGER,
    ADD COLUMN provider_model VARCHAR(100);
ALTER TABLE ai_content_checks DROP CONSTRAINT IF EXISTS chk_ai_content_checks_engine;
ALTER TABLE ai_content_checks ADD CONSTRAINT chk_ai_content_checks_engine
    CHECK (engine IN ('LOCAL', 'OPENAI', 'LOCAL_OPENAI', 'ANTHROPIC', 'LOCAL_ANTHROPIC'));

CREATE TABLE ai_calibrations (
    id BIGSERIAL PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    trigger_type VARCHAR(10) NOT NULL,
    changed BOOLEAN NOT NULL DEFAULT FALSE,
    approve_threshold SMALLINT NOT NULL,
    reject_threshold SMALLINT NOT NULL,
    rule_weights JSONB NOT NULL DEFAULT '{}',
    feedback_count INTEGER NOT NULL DEFAULT 0,
    false_positive_count INTEGER NOT NULL DEFAULT 0,
    false_negative_count INTEGER NOT NULL DEFAULT 0,
    metrics JSONB NOT NULL DEFAULT '{}',
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ai_calibrations_trigger CHECK (trigger_type IN ('INITIAL', 'PLANIFIE', 'MANUEL')),
    CONSTRAINT chk_ai_calibrations_approve CHECK (approve_threshold BETWEEN 21 AND 45),
    CONSTRAINT chk_ai_calibrations_reject CHECK (reject_threshold BETWEEN 60 AND 85)
);
CREATE UNIQUE INDEX uq_ai_calibrations_active ON ai_calibrations (is_active) WHERE is_active;
INSERT INTO ai_calibrations (version, is_active, trigger_type, changed, approve_threshold, reject_threshold)
VALUES (1, TRUE, 'INITIAL', FALSE, 31, 70);

CREATE TABLE ai_feedback (
    id BIGSERIAL PRIMARY KEY,
    decision_log_id BIGINT NOT NULL UNIQUE REFERENCES ai_decision_logs(id) ON DELETE CASCADE,
    campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    check_id BIGINT REFERENCES ai_content_checks(id) ON DELETE SET NULL,
    ai_status VARCHAR(20) NOT NULL,
    admin_decision VARCHAR(20) NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    risk_score SMALLINT NOT NULL,
    quality_score SMALLINT NOT NULL,
    matched_rule_ids JSONB NOT NULL DEFAULT '[]',
    calibration_version INTEGER,
    decided_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ai_feedback_ai_status CHECK (ai_status IN ('APPROVED', 'REVIEW_REQUIRED', 'REJECTED')),
    CONSTRAINT chk_ai_feedback_admin_decision CHECK (admin_decision IN ('VALIDATED', 'VALIDATED_OVERRIDE', 'REJECTED')),
    CONSTRAINT chk_ai_feedback_outcome CHECK (outcome IN ('CONFIRMED_APPROVAL', 'FALSE_NEGATIVE', 'FALSE_POSITIVE', 'CONFIRMED_FLAG'))
);
CREATE INDEX idx_ai_feedback_created ON ai_feedback (created_at DESC);
CREATE INDEX idx_ai_feedback_outcome ON ai_feedback (outcome, created_at);
