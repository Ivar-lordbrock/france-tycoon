-- =====================================================================
-- France Tycoon — migration 005 : déplacer sa capitale (étape 3, paquet 5)
-- La capitale est la commune du siège social. On peut la déplacer (POST /me/capital) une fois tous les
-- 7 jours (DELAI_DEPLACEMENT_CAPITALE_S, shared/src/balance.ts) : on retient la date du dernier déplacement.
-- NULL : jamais déplacée (construire le siège ne compte pas comme un déplacement).
-- =====================================================================

ALTER TABLE users ADD COLUMN capital_moved_at INTEGER;
