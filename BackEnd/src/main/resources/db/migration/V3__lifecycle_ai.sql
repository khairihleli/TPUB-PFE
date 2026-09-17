-- =============================================================================
-- V3 — Campaign lifecycle, campaign zones (point + radius), AI verification v2
-- Lane A of docs/completion-contract.md (§2.1, §2.2, §3)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- campaigns — lifecycle fields
-- ---------------------------------------------------------------------------
ALTER TABLE campaigns
    ADD COLUMN ai_override        BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN rejection_reason   TEXT,
    ADD COLUMN admin_comment      TEXT,
    ADD COLUMN duplicated_from_id BIGINT      REFERENCES campaigns (id) ON DELETE SET NULL,
    ADD COLUMN activated_at       TIMESTAMPTZ,
    ADD COLUMN terminated_at      TIMESTAMPTZ,
    ADD COLUMN termination_reason VARCHAR(30);

ALTER TABLE campaigns
    ADD CONSTRAINT chk_campaigns_termination_reason CHECK (
        termination_reason IS NULL OR termination_reason IN ('PERIODE_TERMINEE', 'BUDGET_EPUISE')
    ),
    ADD CONSTRAINT chk_campaigns_priority_score CHECK (priority_score BETWEEN 0 AND 10);

-- idx_campaigns_status already exists since V1; kept idempotent.
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_client_created ON campaigns (client_id, created_at);

-- ---------------------------------------------------------------------------
-- campaign_zones — targeting circles (several circles may resolve to one zone)
-- ---------------------------------------------------------------------------
ALTER TABLE campaign_zones DROP CONSTRAINT IF EXISTS uq_campaign_zones_campaign_zone;

ALTER TABLE campaign_zones
    ADD COLUMN latitude  NUMERIC(10, 7),
    ADD COLUMN longitude NUMERIC(10, 7),
    ADD COLUMN radius_km NUMERIC(8, 3),
    ADD COLUMN label     VARCHAR(150);

UPDATE campaign_zones cz
SET latitude  = z.latitude,
    longitude = z.longitude,
    radius_km = COALESCE(z.radius_km, 3)
FROM zones z
WHERE z.id = cz.zone_id;

ALTER TABLE campaign_zones
    ALTER COLUMN latitude  SET NOT NULL,
    ALTER COLUMN longitude SET NOT NULL,
    ALTER COLUMN radius_km SET NOT NULL;

ALTER TABLE campaign_zones
    ADD CONSTRAINT chk_campaign_zones_latitude  CHECK (latitude  BETWEEN -90  AND 90),
    ADD CONSTRAINT chk_campaign_zones_longitude CHECK (longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT chk_campaign_zones_radius    CHECK (radius_km > 0 AND radius_km <= 50);

-- idx_campaign_zones_campaign_id already exists since V1; kept idempotent.
CREATE INDEX IF NOT EXISTS idx_campaign_zones_campaign_id ON campaign_zones (campaign_id);

-- ---------------------------------------------------------------------------
-- ai_content_checks — OCR, sector, structured issues, engine, preview flag
-- ---------------------------------------------------------------------------
ALTER TABLE ai_content_checks
    ADD COLUMN extracted_text  TEXT,
    ADD COLUMN ocr_engine      VARCHAR(20) NOT NULL DEFAULT 'AUCUN',
    ADD COLUMN sector          VARCHAR(30),
    ADD COLUMN recommendations JSONB       NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN issues          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN media_analyses  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN matched_rules   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN engine          VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN is_preview      BOOLEAN     NOT NULL DEFAULT FALSE;

ALTER TABLE ai_content_checks
    ADD CONSTRAINT chk_ai_content_checks_ocr_engine CHECK (
        ocr_engine IN ('TESSERACT', 'SIMULE', 'AUCUN')
    ),
    ADD CONSTRAINT chk_ai_content_checks_sector CHECK (
        sector IS NULL OR sector IN (
            'RESTAURATION', 'EVENEMENT', 'IMMOBILIER', 'SERVICE', 'COMMERCE',
            'SANTE', 'FORMATION', 'TRANSPORT', 'AUTRE'
        )
    ),
    ADD CONSTRAINT chk_ai_content_checks_engine CHECK (
        engine IN ('LOCAL', 'OPENAI', 'LOCAL_OPENAI')
    );

CREATE INDEX IF NOT EXISTS idx_ai_content_checks_campaign_checked
    ON ai_content_checks (campaign_id, checked_at DESC);

-- ---------------------------------------------------------------------------
-- ai_moderation_rules — constrained types/sectors + seeded rules
-- ---------------------------------------------------------------------------
ALTER TABLE ai_moderation_rules
    ADD CONSTRAINT chk_ai_moderation_rules_rule_type CHECK (rule_type IN ('KEYWORD', 'REGEX')),
    ADD CONSTRAINT chk_ai_moderation_rules_sector CHECK (
        sector IS NULL OR sector IN (
            'RESTAURATION', 'EVENEMENT', 'IMMOBILIER', 'SERVICE', 'COMMERCE',
            'SANTE', 'FORMATION', 'TRANSPORT', 'AUTRE'
        )
    );

INSERT INTO ai_moderation_rules (rule_name, rule_type, pattern, severity, sector, is_active, description) VALUES
    ('promesse-gratuit-garanti', 'KEYWORD', 'gratuit, garanti, garantie, 100% garanti', 'MEDIUM', NULL, TRUE,
     'Promesses de gratuité ou de garantie absolue : à vérifier (publicité potentiellement trompeuse).'),
    ('allegations-miracles', 'KEYWORD', 'miracle, sans effort, guerison, resultat immediat', 'HIGH', 'SANTE', TRUE,
     'Allégations miraculeuses ou de guérison, interdites sans justification (secteur santé).'),
    ('jeux-argent', 'KEYWORD', 'casino, paris sportifs, jackpot', 'HIGH', NULL, TRUE,
     'Promotion des jeux d''argent et paris : diffusion soumise à validation.'),
    ('alcool-tabac', 'KEYWORD', 'alcool, biere, whisky, cigarette, tabac, chicha', 'HIGH', NULL, TRUE,
     'Promotion de l''alcool ou du tabac : contenu sensible sur l''espace public.'),
    ('armes-drogues', 'KEYWORD', 'arme a feu, munitions, cannabis, cocaine', 'CRITICAL', NULL, TRUE,
     'Armes ou stupéfiants : contenu interdit.'),
    ('incitation-haine', 'KEYWORD', 'incitation a la haine', 'CRITICAL', NULL, TRUE,
     'Incitation à la haine : contenu interdit.'),
    ('donnees-sensibles', 'REGEX', '\b(rib|iban|code pin|mot de passe)\b', 'HIGH', NULL, TRUE,
     'Demande de données bancaires ou d''identifiants : risque d''hameçonnage.'),
    ('urgence-artificielle', 'REGEX', '(derniere chance|offre limitee).{0,20}!{2,}', 'LOW', NULL, TRUE,
     'Urgence artificielle et ponctuation excessive : ton peu professionnel.')
ON CONFLICT (rule_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ai_decision_logs — query indexes for the decisions board
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_created_at ON ai_decision_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_type_created ON ai_decision_logs (decision_type, created_at);
