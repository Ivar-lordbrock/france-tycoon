-- =====================================================================
-- France Tycoon — migration 014 : dashboard /admin, réglages à chaud et événements (23/11/2026)
-- Trois réglages en % (100 = normal) : prix d'achat d'une commune libre, revenus passifs, coût des bâtiments.
-- Les deux tables gardent tout l'historique : les revenus non encaissés se calculent par morceaux avec.
-- =====================================================================

-- Réglages permanents : une ligne par changement (ajout seul) ; la plus récente déjà commencée s'applique.
-- Aucune ligne = tout à 100 %.
CREATE TABLE live_config (
  id            INTEGER PRIMARY KEY,
  price_pct     INTEGER NOT NULL CHECK (price_pct BETWEEN 25 AND 400),
  income_pct    INTEGER NOT NULL CHECK (income_pct BETWEEN 25 AND 400),
  building_pct  INTEGER NOT NULL CHECK (building_pct BETWEEN 25 AND 400),
  reason        TEXT    NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  -- Jamais dans le passé : on ne change pas des revenus déjà gagnés.
  starts_at     INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_live_config_starts ON live_config (starts_at, id);

-- Événements datés : leurs % multiplient les réglages permanents de starts_at à ends_at (fin automatique).
-- Annuler pose cancelled_at = maintenant : l'événement s'arrête là, le passé ne change pas.
CREATE TABLE game_events (
  id            INTEGER PRIMARY KEY,
  title         TEXT    NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  price_pct     INTEGER NOT NULL CHECK (price_pct BETWEEN 25 AND 400),
  income_pct    INTEGER NOT NULL CHECK (income_pct BETWEEN 25 AND 400),
  building_pct  INTEGER NOT NULL CHECK (building_pct BETWEEN 25 AND 400),
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER NOT NULL CHECK (ends_at > starts_at),
  cancelled_at  INTEGER,
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_game_events_ends ON game_events (ends_at);
