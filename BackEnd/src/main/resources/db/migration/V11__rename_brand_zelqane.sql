-- ---------------------------------------------------------------------------
-- Brand rename: TPUB -> ZELQANE in stored role descriptions.
-- V1/V5 stay untouched so Flyway checksums of applied migrations remain valid.
-- ---------------------------------------------------------------------------
UPDATE roles SET
    description = REPLACE(description, 'TPUB', 'ZELQANE'),
    updated_at = NOW()
WHERE description LIKE '%TPUB%';
