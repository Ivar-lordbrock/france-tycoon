-- =====================================================================
-- France Tycoon — migration 006 : quêtes du jour (étape 5, paquet 2)
-- Règles dans docs/05-equilibrage.md (5.7).
-- =====================================================================

-- Une même commune (« Repérage »), zone (« Cap sur l'Outre-mer ») ou heure d'encaissement (« Trésorier »)
-- ne compte qu'une fois par quête : on garde la liste de ce qui a déjà compté (tableau JSON).
ALTER TABLE user_quests ADD COLUMN seen_refs TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(seen_refs));

-- Les chantiers comptent quand ils sont terminés : un chantier annulé est remboursé, il ne compte pas.
UPDATE daily_quests SET description = 'Termine {target} chantier(s).' WHERE code = 'chantiers';
UPDATE daily_quests SET description = 'Termine {target} amélioration(s) de bâtiment.' WHERE code = 'modernisation';
UPDATE daily_quests SET description = 'Termine {target} chantiers.' WHERE code = 'grand_chantier';
-- Un clic sur « Encaisser » par heure au plus : cliquer 4 fois de suite ne suffit pas.
UPDATE daily_quests SET description = 'Encaisse tes revenus {target} fois, à des heures différentes.' WHERE code = 'encaisser';
