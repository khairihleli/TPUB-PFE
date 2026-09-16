-- =============================================================================
-- V2 — Porteur fields on diffusion_supports (additive, backward compatible)
--   porteur_type  : typologie du Porteur (A panoramique 360°, B double face,
--                   C écran simple, D infrastructure sans écran)
--   mast_height_m : hauteur de mât déclarée (15, 20, 25 ou 30 m)
--   heading_deg   : orientation de la face principale (0 = nord, sens horaire)
--   address       : adresse lisible du Porteur
-- All columns are nullable: existing rows stay valid.
-- =============================================================================

ALTER TABLE diffusion_supports
    ADD COLUMN porteur_type  VARCHAR(1)   NULL,
    ADD COLUMN mast_height_m SMALLINT     NULL,
    ADD COLUMN heading_deg   SMALLINT     NULL,
    ADD COLUMN address       VARCHAR(255) NULL;

ALTER TABLE diffusion_supports
    ADD CONSTRAINT chk_diffusion_supports_porteur_type
        CHECK (porteur_type IN ('A', 'B', 'C', 'D')),
    ADD CONSTRAINT chk_diffusion_supports_mast_height
        CHECK (mast_height_m IN (15, 20, 25, 30)),
    ADD CONSTRAINT chk_diffusion_supports_heading
        CHECK (heading_deg BETWEEN 0 AND 359);
