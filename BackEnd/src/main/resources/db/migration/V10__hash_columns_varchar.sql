-- ---------------------------------------------------------------------------
-- V10 — aligne le type des colonnes d'empreintes sur le modèle JPA
--
-- V7 déclare code_hash / token_hash / key_hash en CHAR(64). PostgreSQL les expose
-- alors comme « bpchar », que la validation de schéma Hibernate refuse face au
-- @Column(length = 64) des entités (varchar). CHAR complète en plus les valeurs
-- par des espaces, ce qui fausserait une comparaison d'empreinte hexadécimale
-- plus courte. On repasse ces trois colonnes en VARCHAR(64).
-- ---------------------------------------------------------------------------

ALTER TABLE user_recovery_codes ALTER COLUMN code_hash TYPE VARCHAR(64);
ALTER TABLE login_challenges ALTER COLUMN token_hash TYPE VARCHAR(64);
ALTER TABLE support_device_keys ALTER COLUMN key_hash TYPE VARCHAR(64);
