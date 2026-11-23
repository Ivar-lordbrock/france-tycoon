-- =====================================================================
-- France Tycoon — migration 011 : dashboard /admin, vue Joueurs (23/11/2026)
-- Suspension temporaire, notes de l'équipe, connexions (IP et navigateur hachés avec un sel),
-- journal d'audit des actions de l'équipe (en ajout seul).
-- =====================================================================

-- Suspendu : il se connecte et regarde, mais toute action est refusée jusqu'à `suspended_until`.
ALTER TABLE users ADD COLUMN suspended_until INTEGER;
ALTER TABLE users ADD COLUMN suspension_reason TEXT;

-- Notes visibles par l'équipe seulement.
CREATE TABLE staff_notes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES users (id) ON DELETE SET NULL,
  body        TEXT    NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_staff_notes_user ON staff_notes (user_id, created_at DESC);

-- Une ligne par connexion. Jamais d'IP en clair : sha256(sel + IP), sel dans IP_SALT. Gardées 90 jours.
CREATE TABLE login_events (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ip_hash     TEXT    NOT NULL,
  ua_hash     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_login_events_user ON login_events (user_id, created_at DESC);
CREATE INDEX idx_login_events_ip   ON login_events (ip_hash, created_at);
CREATE INDEX idx_login_events_time ON login_events (created_at);

-- Qui a fait quoi dans le dashboard. Pas de clé étrangère : une ligne d'audit ne bouge jamais.
CREATE TABLE admin_audit (
  id            INTEGER PRIMARY KEY,
  actor_id      INTEGER NOT NULL,
  actor_pseudo  TEXT    NOT NULL,
  actor_role    TEXT    NOT NULL CHECK (actor_role IN ('moderator', 'admin')),
  action        TEXT    NOT NULL,
  target_type   TEXT    NOT NULL,
  target_id     TEXT    NOT NULL,
  before_json   TEXT    CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json    TEXT    CHECK (after_json IS NULL OR json_valid(after_json)),
  reason        TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_admin_audit_time   ON admin_audit (created_at DESC);
CREATE INDEX idx_admin_audit_target ON admin_audit (target_type, target_id, created_at DESC);

CREATE TRIGGER trg_admin_audit_no_update BEFORE UPDATE ON admin_audit BEGIN
  SELECT RAISE(ABORT, 'admin_audit est en ajout seul');
END;
CREATE TRIGGER trg_admin_audit_no_delete BEFORE DELETE ON admin_audit BEGIN
  SELECT RAISE(ABORT, 'admin_audit est en ajout seul');
END;
