-- =====================================================================
-- France Tycoon — migration 007 : ordre du tutoriel (critique UI du 23/11/2026)
-- Le sélecteur de zones (Outre-mer) arrivait juste avant l'achat et faisait quitter la commune choisie :
-- il passe après la boucle de jeu (fiche → achat → construire → encaisser → quêtes).
-- « Clique » ne va pas au doigt : « Choisis ».
-- =====================================================================

-- `position` est UNIQUE : on écarte d'abord toutes les étapes pour éviter les doublons en cours de route.
UPDATE tutorials SET position = position + 100;
UPDATE tutorials SET position = CASE step_key
  WHEN 'bienvenue' THEN 1
  WHEN 'explorer_carte' THEN 2
  WHEN 'fiche_commune' THEN 3
  WHEN 'premier_achat' THEN 4
  WHEN 'premiere_construction' THEN 5
  WHEN 'encaisser' THEN 6
  WHEN 'quetes' THEN 7
  WHEN 'selecteur_zones' THEN 8
  WHEN 'opa' THEN 9
  WHEN 'classement' THEN 10
END;

UPDATE tutorials
SET body = 'Choisis une commune sur la carte : population, équipements, prix et revenu.'
WHERE step_key = 'fiche_commune';
