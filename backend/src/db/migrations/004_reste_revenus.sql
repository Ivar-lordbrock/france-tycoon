-- =====================================================================
-- France Tycoon — migration 004 : les fractions de ₮ des revenus (étape 3, paquet 4)
-- Le serveur encaisse les revenus à chaque action (docs/05-equilibrage.md, 5.3). Un joueur qui gagne
-- 50 ₮/h et agit toutes les 30 s gagnerait 0,4 ₮ à chaque fois : arrondi à 0, il ne toucherait jamais rien.
-- On garde donc le reste (en ₮ × secondes, moins d'un ₮) pour le prochain encaissement.
-- Calcul : shared/src/balance.ts (revenuCumule, partagerCumul).
-- =====================================================================

ALTER TABLE users ADD COLUMN income_remainder INTEGER NOT NULL DEFAULT 0
  CHECK (income_remainder BETWEEN 0 AND 3599);
