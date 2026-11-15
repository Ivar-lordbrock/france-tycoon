-- =====================================================================
-- France Tycoon — migration 002 : données de référence (catalogues)
-- Les valeurs viennent de docs/05-equilibrage.md : changer les deux ensemble.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types de bâtiments
-- coût(L)   = base_cost × f_T × cost_growth^(L-1)        (f_T = 1 si scales_with_territory = 0)
-- revenu(L) = base_income_per_hour × f_T × L × income_growth^(L-1)
-- temps(L)  = base_build_seconds × time_growth^(L-1)
-- ---------------------------------------------------------------------
INSERT INTO building_types
  (code, name, category, description,
   base_cost, cost_growth, base_income_per_hour, income_growth, income_bonus_pct, territory_slot_bonus,
   base_build_seconds, time_growth, max_level, slot_size, max_per_territory, max_per_user, min_population, scales_with_territory)
VALUES
  ('residence', 'Résidence', 'logement',
   'Des logements à louer. Le premier bâtiment de tout bon magnat.',
   3000, 1.4, 200, 1.0, 0, 0, 300, 1.5, 10, 1, NULL, NULL, 0, 1),
  ('commerce', 'Commerce de proximité', 'commerce',
   'Boulangerie, épicerie, café : rapporte plus qu''une résidence, il faut un peu de monde.',
   5500, 1.4, 350, 1.0, 0, 0, 900, 1.5, 10, 1, NULL, NULL, 200, 1),
  ('usine', 'Usine', 'industrie',
   'Gros rendement, mais prend deux emplacements.',
   15000, 1.4, 900, 1.0, 0, 0, 2700, 1.5, 10, 2, 2, NULL, 1000, 1),
  ('bureaux', 'Quartier d''affaires', 'commerce',
   'Tours de bureaux réservées aux villes de plus de 20 000 habitants.',
   40000, 1.4, 2400, 1.0, 0, 0, 7200, 1.5, 10, 2, 2, NULL, 20000, 1),
  ('equipement', 'Équipement public', 'infrastructure',
   'Gare, parc ou médiathèque : +8 % de revenus sur tout le territoire par niveau.',
   8000, 1.4, 0, 1.0, 8, 0, 1800, 1.5, 10, 1, 1, NULL, 0, 1),
  ('siege_social', 'Siège social', 'siege',
   'Votre capitale : +1 territoire maximum par niveau. La commune qui l''héberge est immunisée contre les OPA.',
   40000, 2.5, 0, 1.0, 0, 1, 3600, 2.0, 7, 2, 1, 1, 0, 0);

-- ---------------------------------------------------------------------
-- Tutoriel (10 étapes)
-- ---------------------------------------------------------------------
INSERT INTO tutorials (step_key, position, title, body, ui_anchor, completion_event, validated_by, reward_cash, reward_gems) VALUES
  ('bienvenue',           1,  'Bienvenue, futur magnat',     'La France entière est à vendre, commune par commune. Commençons par un tour du propriétaire.', 'hud-wallet',         'tutorial_started',      'client', 0,    0),
  ('explorer_carte',      2,  'Explore la carte',            'Zoome sur ta région jusqu''à voir les contours des communes.',                                 'map',                'map_zoomed',            'client', 0,    0),
  ('selecteur_zones',     3,  'La France, c''est aussi loin', 'Utilise le sélecteur pour sauter en Guadeloupe, à La Réunion ou en Polynésie.',              'zone-selector',      'zone_selected',         'client', 0,    0),
  ('fiche_commune',       4,  'Ouvre une fiche',             'Clique sur une commune : population, équipements, prix et revenu.',                            'territory-panel',    'territory_opened',      'client', 0,    0),
  ('premier_achat',       5,  'Ton premier territoire',      'Achète une commune libre. Astuce : les petits villages sont abordables.',                      'buy-button',         'territory_bought',      'server', 5000, 0),
  ('premiere_construction', 6, 'Construis',                  'Lance une Résidence. Ton premier chantier se termine en 10 secondes.',                         'build-button',       'building_started',      'server', 0,    0),
  ('encaisser',           7,  'Encaisse',                    'Tes territoires rapportent même quand tu es absent (jusqu''à 24 h). Encaisse tes revenus.',    'collect-button',     'income_collected',      'server', 2000, 0),
  ('quetes',              8,  'Quêtes du jour',              'Trois missions chaque jour, de quoi gonfler ta trésorerie.',                                   'quests-button',      'quests_opened',         'client', 0,    0),
  ('opa',                 9,  'Attention aux OPA',           'Un rival peut racheter ta commune en payant 150 % de sa valeur. Tu as 24 h pour te défendre. Tu es protégé 72 h après ton inscription.', 'takeover-help', 'takeover_help_read', 'client', 0, 0),
  ('classement',          10, 'Le classement national',      'Les plus gros patrimoines de France. À toi de grimper !',                                      'leaderboard-button', 'leaderboard_viewed',    'server', 3000, 5);

-- ---------------------------------------------------------------------
-- Quêtes journalières (catalogue ; 3 tirées par joueur et par jour : 1 facile, 1 moyenne, 1 difficile)
-- ---------------------------------------------------------------------
INSERT INTO daily_quests (code, title, description, event_type, target_min, target_max, difficulty, reward_income_hours, reward_cash_min, reward_gems, min_territories, weight) VALUES
  ('passer_au_bureau',  'Passer au bureau',       'Connecte-toi aujourd''hui.',                         'login',              1, 1, 'facile',    1.0, 500,  0, 0, 5),
  ('encaisser',         'Trésorier',              'Encaisse tes revenus {target} fois.',               'income_collected',   2, 4, 'facile',    1.5, 800,  0, 1, 10),
  ('reperage',          'Repérage',               'Consulte {target} fiches de communes.',              'territory_visited',  3, 8, 'facile',    1.5, 800,  0, 0, 10),
  ('cap_outre_mer',     'Cap sur l''Outre-mer',   'Explore {target} zone(s) d''Outre-mer.',             'zone_visited',       1, 3, 'facile',    1.5, 800,  0, 0, 8),
  ('veille',            'Veille concurrentielle', 'Consulte le classement national.',                   'leaderboard_viewed', 1, 1, 'facile',    1.0, 500,  0, 0, 5),
  ('chantiers',         'Chef de chantier',       'Lance {target} chantier(s).',                        'building_started',   1, 3, 'moyen',     2.5, 1500, 0, 1, 10),
  ('modernisation',     'Modernisation',          'Améliore {target} bâtiment(s).',                     'building_upgraded',  1, 3, 'moyen',     2.5, 1500, 0, 1, 10),
  ('expansion',         'Expansion',              'Acquiers un nouveau territoire.',                    'territory_bought',   1, 1, 'difficile', 4.0, 3000, 2, 0, 8),
  ('raider',            'Raider',                 'Lance une OPA sur un rival.',                        'takeover_launched',  1, 1, 'difficile', 4.0, 3000, 3, 1, 6),
  ('grand_chantier',    'Grand chantier',         'Lance {target} chantiers.',                          'building_started',   4, 6, 'difficile', 4.0, 3000, 2, 2, 8);

-- ---------------------------------------------------------------------
-- Boutique (V2) : objets prêts mais inactifs (is_active = 0)
-- Règle anti pay-to-win : rien qui touche aux OPA ; boosts plafonnés ; emplacements aussi achetables en cash.
-- ---------------------------------------------------------------------
INSERT INTO shop_items (sku, name, kind, price_gems, price_cash, effect, duration_seconds, max_per_user, is_active) VALUES
  ('skin_tour_eiffel',     'Marqueur « Tour Eiffel »',        'marker_skin',      50,  NULL,     '{"skin":"tour_eiffel"}',  NULL,  1, 0),
  ('skin_phare_breton',    'Marqueur « Phare breton »',       'marker_skin',      50,  NULL,     '{"skin":"phare_breton"}', NULL,  1, 0),
  ('skin_case_creole',     'Marqueur « Case créole »',        'marker_skin',      50,  NULL,     '{"skin":"case_creole"}',  NULL,  1, 0),
  ('boost_revenu_10_24h',  'Boost revenus +10 % (24 h)',      'income_boost',     30,  NULL,     '{"income_pct":10}',       86400, NULL, 0),
  ('file_construction_2',  '2e file de construction',         'build_queue_slot', 300, 2000000,  '{"build_queue_slots":1}', NULL,  1, 0),
  ('emplacement_territoire', 'Emplacement de territoire +1',  'territory_slot',   500, 25000000, '{"territory_slots":1}',   NULL,  1, 0);
