-- =====================================================================
-- France Tycoon — migration 012 : dashboard /admin, vue Territoires et OPA (23/11/2026)
-- Prix d'achat forcé par un admin. NULL = calcul auto (V0). Le motif est dans admin_audit.
-- =====================================================================

ALTER TABLE territories ADD COLUMN forced_price INTEGER CHECK (forced_price IS NULL OR forced_price > 0);
CREATE INDEX idx_territories_forced_price ON territories (forced_price) WHERE forced_price IS NOT NULL;
