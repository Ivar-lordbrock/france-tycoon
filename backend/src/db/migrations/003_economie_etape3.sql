-- =====================================================================
-- France Tycoon — migration 003 : l'argent du jeu (étape 3)
-- Décisions du 17/11/2026 (docs/idees.md, « Décisions prises ») ; valeurs de docs/05-equilibrage.md, 5.2.
-- Remplace des valeurs de 002 : les migrations sont en ajout seul, 002 ne bouge pas.
--
-- coût(L)   = arrondi_10( base_cost × f_T × cost_growth^(L-1) )   (f_T = 1 si scales_with_territory = 0)
-- revenu(L) = arrondi( base_income_per_hour × f_T × income_growth^(L-1) )   (plus de « × L » comme en 002)
-- temps(L)  = base_build_seconds × time_growth^(L-1)
-- Formules : shared/src/balance.ts (coutNiveau, revenuNiveau, dureeChantier).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bâtiments : 5 niveaux pour tous ; coût ×2, revenu ×1,7, durée ×2 par niveau (siège : coût ×2,5)
-- ---------------------------------------------------------------------
UPDATE building_types SET max_level = 5, cost_growth = 2, time_growth = 2;
UPDATE building_types SET cost_growth = 2.5 WHERE code = 'siege_social';
UPDATE building_types SET income_growth = 1.7 WHERE base_income_per_hour > 0;

-- Durée du niveau 1 (Résidence 10 min → 2 h 40 au niveau 5)
UPDATE building_types SET base_build_seconds = CASE code
  WHEN 'residence'    THEN 600
  WHEN 'commerce'     THEN 1200
  WHEN 'usine'        THEN 3600
  WHEN 'bureaux'      THEN 7200
  WHEN 'equipement'   THEN 1800
  WHEN 'siege_social' THEN 3600
  ELSE base_build_seconds
END;

-- La gare devient un bâtiment à part : l'équipement public ne la cite plus.
UPDATE building_types
SET description = 'Parc, médiathèque ou piscine : +8 % de revenus sur tout le territoire par niveau.'
WHERE code = 'equipement';

-- Nouvelle gare : 2 emplacements, 2 000 habitants, une par commune, +10 % par niveau (3 h → 48 h)
INSERT INTO building_types
  (code, name, category, description,
   base_cost, cost_growth, base_income_per_hour, income_growth, income_bonus_pct, territory_slot_bonus,
   base_build_seconds, time_growth, max_level, slot_size, max_per_territory, max_per_user, min_population, scales_with_territory)
VALUES
  ('gare', 'Gare', 'infrastructure',
   'Les trains amènent du monde : +10 % de revenus sur tout le territoire par niveau. Il faut 2 000 habitants.',
   20000, 2, 0, 1.0, 10, 0, 10800, 2, 5, 2, 1, NULL, 2000, 1);

-- ---------------------------------------------------------------------
-- Chantiers : prix payé, pour rembourser exactement en cas d'annulation
-- (f_T peut changer après un import : on ne recalcule pas le coût).
-- Rempli seulement pendant un chantier, toujours positif.
-- ---------------------------------------------------------------------
ALTER TABLE buildings ADD COLUMN works_cost INTEGER
  CHECK ((works_cost IS NULL) = (target_level IS NULL) AND (works_cost IS NULL OR works_cost > 0));

-- ---------------------------------------------------------------------
-- 4 territoires au départ au lieu de 3.
-- La valeur par défaut de la colonne (3, migration 001) ne se change pas sans reconstruire
-- la table : la création de compte écrit TERRITOIRES_DEPART (balance.ts) elle-même.
-- ---------------------------------------------------------------------
UPDATE users SET max_territories = min(12, max_territories + 1);

-- ---------------------------------------------------------------------
-- Tutoriel : plafond hors ligne passé de 24 h à 48 h
-- ---------------------------------------------------------------------
UPDATE tutorials
SET body = 'Tes territoires rapportent même quand tu es absent (jusqu''à 48 h). Encaisse tes revenus.'
WHERE step_key = 'encaisser';
