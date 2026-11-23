-- =====================================================================
-- France Tycoon — migration 009 : feuille de route publique (page /roadmap, 23/11/2026)
-- Les fonctionnalités prévues, lues par GET /roadmap (backend/src/modules/roadmap/).
-- Rejouable sans doublon : table créée si absente, `code` unique, un code déjà présent est ignoré.
-- Changer un statut ou un texte plus tard : nouvelle migration avec un UPDATE (ajout seul).
-- =====================================================================

CREATE TABLE IF NOT EXISTS roadmap_features (
  id          INTEGER PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,
  position    INTEGER NOT NULL,                                   -- ordre d'affichage
  category    TEXT    NOT NULL CHECK (category IN ('social', 'gameplay', 'economy')),
  status      TEXT    NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'released')),
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL,
  details     TEXT    NOT NULL CHECK (json_valid(details) AND json_type(details) = 'array'), -- points détaillés, tableau JSON de textes
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

INSERT INTO roadmap_features (code, position, category, title, summary, details) VALUES
  ('intercommunalite', 1, 'social',
   'Intercommunalité (clans géographiques)',
   'Système de clans basé sur la proximité géographique réelle des communes.',
   json_array(
     'Création ou adhésion soumise à une contrainte géographique stricte : la commune du joueur doit être limitrophe ou située dans un rayon défini autour d''au moins une commune déjà membre.',
     'Mutualisation d''un budget (taxe intercommunale) pour financer des infrastructures communes profitant à tous les membres.',
     'Bonus de continuité territoriale : plus le bloc géographique formé par l''intercommunalité est compact, plus le bonus de revenu global est élevé.'
   )),
  ('jumelage', 2, 'social',
   'Jumelage entre communes',
   'Accord diplomatique entre deux joueurs offrant un revenu passif mutuel.',
   json_array(
     'Proposition envoyée par un joueur vers la commune d''un autre joueur (impossible de jumeler ses propres villes entre elles).',
     'Génère un bonus de revenu passif pour les deux communes jumelées (bonus potentiellement indexé sur la distance).',
     'Persistance lors de la revente à l''État : si l''un des joueurs revend sa commune à l''État, le jumelage reste actif sur la commune. Lorsqu''un nouveau joueur rachète ce territoire, il a le choix de conserver l''accord de jumelage existant ou de le rompre.'
   )),
  ('saisons', 3, 'gameplay',
   'Cycle des saisons',
   'Compression d''une année complète sur 1 mois réel (1 semaine = 1 saison) impactant les revenus selon la géographie.',
   json_array(
     'Cycle temporel dynamique : 1 mois réel est divisé en 4 saisons (printemps, été, automne, hiver, soit 7 jours par saison).',
     'Impact géographique sur les revenus : les stations balnéaires et communes littorales génèrent nettement plus de revenus en été qu''en hiver, tandis que les communes de montagne et stations de ski sont boostées en hiver.',
     'Encourage la diversification géographique du portefeuille immobilier des joueurs pour lisser leurs revenus sur le mois.'
   )),
  ('gemmes', 4, 'economy',
   'Économie des gemmes (événements et accélération)',
   'Utilisation des gemmes pour lancer des événements temporaires (multiplicateurs) et accélérer les constructions.',
   json_array(
     'Organisation d''événements : le joueur dépense des gemmes dans une commune pour organiser un concert, un festival ou une fête locale, octroyant un multiplicateur de revenus temporaire (synergie avec les saisons).',
     'Accélération des travaux : les gemmes permettent de réduire ou terminer instantanément le temps de construction et d''amélioration des bâtiments.'
   )),
  ('aleas', 5, 'gameplay',
   'Événements aléatoires et aléas dynamiques',
   'Événements climatiques, économiques et appels à projets temporaires venant dynamiser le gameplay.',
   json_array(
     'Aléas climatiques couplés aux saisons (ex. : canicule boostant le littoral mais pénalisant les métropoles, vague de froid boostant les stations de ski).',
     'Appels à projets et subventions de l''État : objectifs temporaires hebdomadaires (ex. : construire un certain type d''infrastructure) récompensant les joueurs actifs en argent ou en gemmes.'
   ))
ON CONFLICT (code) DO NOTHING;
