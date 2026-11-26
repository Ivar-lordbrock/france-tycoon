-- =====================================================================
-- France Tycoon — migration 017 : saisons (26/11/2026)
-- Une saison par semaine (docs/05, 5.12). Le profil d'une commune dit quelle saison lui profite.
-- Les profils restent vides : ils viendront d'un import (listes officielles littoral et montagne,
-- densité pour le rural). Sans profil, la saison ne change rien.
-- Les bonus et malus sont coupés pendant la bêta (EFFETS_SAISONS_ACTIFS dans shared/src/balance.ts).
-- =====================================================================

ALTER TABLE territories ADD COLUMN season_profile TEXT CHECK (season_profile IN ('littoral', 'montagne', 'rural'));

-- Page /roadmap : les saisons passent « en cours » (code prêt, effets coupés).
UPDATE roadmap_features SET status = 'in_progress', updated_at = unixepoch() WHERE code = 'saisons';
