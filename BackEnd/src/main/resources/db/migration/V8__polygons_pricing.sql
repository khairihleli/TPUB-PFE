-- Round 2, lane L3 carte-prix (docs/round2-contract.md §4.7): polygon campaign zones, emergency polygon targeting,
-- dynamic pricing frozen on reservations.

ALTER TABLE campaign_zones
    ADD COLUMN geometry_type VARCHAR(10) NOT NULL DEFAULT 'CERCLE',
    ADD COLUMN polygon JSONB,
    ADD COLUMN area_km2 NUMERIC(10,3);
ALTER TABLE campaign_zones
    ADD CONSTRAINT chk_campaign_zones_geometry_type CHECK (geometry_type IN ('CERCLE', 'POLYGONE')),
    ADD CONSTRAINT chk_campaign_zones_geometry CHECK (
        (geometry_type = 'CERCLE' AND polygon IS NULL) OR (geometry_type = 'POLYGONE' AND polygon IS NOT NULL));
UPDATE campaign_zones SET area_km2 = ROUND((PI() * radius_km * radius_km)::numeric, 3) WHERE area_km2 IS NULL;

ALTER TABLE emergency_messages ADD COLUMN target_polygon JSONB;
ALTER TABLE emergency_messages ADD CONSTRAINT chk_emergency_messages_polygon_xor_circle
    CHECK (target_polygon IS NULL OR (latitude IS NULL AND longitude IS NULL AND radius_km IS NULL));

ALTER TABLE reservations
    ADD COLUMN price_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.0000,
    ADD COLUMN base_cost NUMERIC(12,2),
    ADD COLUMN pricing_breakdown JSONB;
ALTER TABLE reservations ADD CONSTRAINT chk_reservations_price_multiplier CHECK (price_multiplier BETWEEN 0.5 AND 2.0);
UPDATE reservations SET base_cost = estimated_cost WHERE base_cost IS NULL;
