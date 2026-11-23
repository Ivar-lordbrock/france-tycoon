-- =====================================================================
-- France Tycoon — migration 015 : dashboard /admin, anti-triche et journaux (23/11/2026)
-- Les alertes ne sont pas stockées : le serveur les recalcule à chaque lecture (3 règles, docs/04).
-- On garde seulement ce que l'équipe en a fait, et les erreurs 500 de l'API.
-- =====================================================================

-- Alerte classée par l'équipe. La clé dit la règle et les faits (joueurs, OPA, transaction) :
-- un fait nouveau donne une clé nouvelle, donc l'alerte revient.
CREATE TABLE cheat_reviews (
  alert_key    TEXT    PRIMARY KEY CHECK (length(alert_key) BETWEEN 3 AND 200),
  note         TEXT    NOT NULL CHECK (length(note) BETWEEN 3 AND 500),
  reviewed_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT, WITHOUT ROWID;

-- Erreurs 500 de l'API (route sans paramètres, jamais la requête). On garde les 1 000 dernières.
CREATE TABLE app_errors (
  id          INTEGER PRIMARY KEY,
  method      TEXT    NOT NULL,
  route       TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Transaction précédente du même joueur dans la même devise (règle « solde qui monte sans raison »).
CREATE INDEX idx_wallet_user_currency ON wallet_transactions (user_id, currency);
-- Journal d'activité et graphiques par jour.
CREATE INDEX idx_wallet_time ON wallet_transactions (created_at);
