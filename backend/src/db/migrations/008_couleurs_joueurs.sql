-- =====================================================================
-- France Tycoon — migration 008 : une couleur par joueur (critique UI du 23/11/2026)
-- Tous les joueurs gardaient le bleu par défaut : impossible de distinguer les rivaux sur la carte.
-- Ceux qui l'ont encore reçoivent la couleur de la palette selon leur numéro, comme à l'inscription
-- (COULEURS_JOUEURS dans backend/src/modules/auth/comptes.ts : même liste, même ordre).
-- =====================================================================

UPDATE users SET marker_color = CASE (id - 1) % 8
  WHEN 0 THEN '#2563eb'
  WHEN 1 THEN '#dc2626'
  WHEN 2 THEN '#16a34a'
  WHEN 3 THEN '#9333ea'
  WHEN 4 THEN '#db2777'
  WHEN 5 THEN '#4d7c0f'
  WHEN 6 THEN '#92400e'
  ELSE '#0369a1'
END
WHERE marker_color = '#2563eb';
