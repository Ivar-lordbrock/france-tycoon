-- =====================================================================
-- France Tycoon — migration 013 : dashboard /admin, contrôle live et signalements (23/11/2026)
-- État du site (maintenance, bannière) sur une seule ligne ; signalements de bugs envoyés par les joueurs.
-- =====================================================================

-- Une seule ligne (id = 1). NULL = coupé.
CREATE TABLE site_status (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  -- Maintenance : toute écriture d'un joueur répond 503 avec ce message ; l'équipe passe.
  maintenance_message  TEXT    CHECK (maintenance_message IS NULL OR length(maintenance_message) BETWEEN 3 AND 300),
  banner_text          TEXT    CHECK (banner_text IS NULL OR length(banner_text) BETWEEN 3 AND 300),
  -- Fin de la bannière ; NULL = jusqu'à ce qu'on la retire.
  banner_until         INTEGER,
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
INSERT INTO site_status (id) VALUES (1);

-- « Signaler un bug » : le joueur écrit, l'équipe suit (statut + note interne).
CREATE TABLE player_reports (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  body        TEXT    NOT NULL CHECK (length(body) BETWEEN 10 AND 2000),
  -- Où était le joueur (chemin de la page), pour retrouver le bug.
  page        TEXT    CHECK (page IS NULL OR length(page) <= 200),
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
  staff_note  TEXT    CHECK (staff_note IS NULL OR length(staff_note) <= 2000),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_player_reports_status ON player_reports (status, created_at DESC);
CREATE INDEX idx_player_reports_user   ON player_reports (user_id, created_at);
