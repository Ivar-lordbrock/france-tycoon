-- =====================================================================
-- France Tycoon — migration 016 : appels à projets de l'État (26/11/2026)
-- Chaque semaine (du lundi au dimanche, heure de Paris), un objectif commun à tous les joueurs.
-- La liste des projets et la prime vivent dans shared/src/balance.ts (docs/05, 5.11).
-- Une ligne par joueur et par semaine, créée à sa première action qui compte.
-- =====================================================================

CREATE TABLE user_state_projects (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  week          TEXT    NOT NULL CHECK (week GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), -- lundi (Europe/Paris)
  project_code  TEXT    NOT NULL,                                 -- APPELS_A_PROJETS (balance.ts)
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at  INTEGER,                                          -- réussi : la prime est versée à cet instant
  reward_cash   INTEGER NOT NULL DEFAULT 0 CHECK (reward_cash >= 0),
  reward_gems   INTEGER NOT NULL DEFAULT 0 CHECK (reward_gems >= 0),
  UNIQUE (user_id, week)
) STRICT;

-- Page /roadmap : les aléas passent « en cours » (les appels à projets en sont la première moitié).
UPDATE roadmap_features SET status = 'in_progress', updated_at = unixepoch() WHERE code = 'aleas';
