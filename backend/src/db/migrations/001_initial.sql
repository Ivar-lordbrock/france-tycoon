-- =====================================================================
-- France Tycoon — migration 001 : schéma initial (SQLite >= 3.38)
-- Conventions (tables STRICT : types vérifiés par SQLite) :
--   * dates = INTEGER, secondes Unix (UTC) ; unixepoch() par défaut
--   * argent = INTEGER (aucune virgule) ; cash = monnaie de jeu, premium_currency = gemmes
--   * à l'ouverture de la connexion, l'application exécute :
--       PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
--       PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;
-- =====================================================================

-- ---------------------------------------------------------------------
-- Joueurs
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                    INTEGER PRIMARY KEY,
  google_id             TEXT    NOT NULL UNIQUE,              -- "sub" du jeton Google
  email                 TEXT    NOT NULL UNIQUE,
  pseudo                TEXT    NOT NULL UNIQUE COLLATE NOCASE
                          CHECK (length(pseudo) BETWEEN 3 AND 24),
  avatar_url            TEXT,
  role                  TEXT    NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  status                TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dormant', 'banned', 'deleted')),

  -- Portefeuille (deux devises séparées dès la V1)
  cash                  INTEGER NOT NULL DEFAULT 0 CHECK (cash >= 0),
  premium_currency      INTEGER NOT NULL DEFAULT 0 CHECK (premium_currency >= 0),

  -- Limites (recalculées par le service : 3 + niveau du siège + bonus de rang + emplacements achetés, plafond 12)
  max_territories       INTEGER NOT NULL DEFAULT 3 CHECK (max_territories BETWEEN 1 AND 12),
  extra_territory_slots INTEGER NOT NULL DEFAULT 0 CHECK (extra_territory_slots BETWEEN 0 AND 1),
  build_queue_slots     INTEGER NOT NULL DEFAULT 1 CHECK (build_queue_slots BETWEEN 1 AND 3),
  rank_level            INTEGER NOT NULL DEFAULT 0 CHECK (rank_level >= 0),

  -- Économie
  income_collected_at   INTEGER NOT NULL DEFAULT (unixepoch()),  -- dernier calcul des revenus passifs
  net_worth             INTEGER NOT NULL DEFAULT 0,               -- patrimoine mis en cache pour le classement
  net_worth_updated_at  INTEGER,

  -- Protection et apparence
  newbie_shield_until   INTEGER NOT NULL DEFAULT (unixepoch() + 259200), -- 72 h sans OPA à l'inscription
  marker_color          TEXT    NOT NULL DEFAULT '#2563eb' CHECK (marker_color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  marker_skin           TEXT    NOT NULL DEFAULT 'default',

  -- Tutoriel
  tutorial_completed_at INTEGER,
  tutorial_skipped      INTEGER NOT NULL DEFAULT 0 CHECK (tutorial_skipped IN (0, 1)),

  last_active_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_users_inactivity  ON users (status, last_active_at);
CREATE INDEX idx_users_leaderboard ON users (net_worth DESC) WHERE status = 'active';

-- Sessions (cookie httpOnly ; on ne stocke que le hachage SHA-256 du jeton)
CREATE TABLE sessions (
  id            TEXT    PRIMARY KEY,                          -- sha256(jeton) en hexadécimal
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  user_agent    TEXT
) STRICT;
CREATE INDEX idx_sessions_user    ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- ---------------------------------------------------------------------
-- Territoires = communes françaises (Métropole + Outre-mer), importées de l'API Geo
-- ---------------------------------------------------------------------
CREATE TABLE territories (
  id                   INTEGER PRIMARY KEY,
  insee_code           TEXT    NOT NULL UNIQUE CHECK (length(insee_code) = 5),
  name                 TEXT    NOT NULL,
  department_code      TEXT    NOT NULL,                      -- '01'..'95', '2A', '2B', '971'..'988'
  region_code          TEXT,
  region_type          TEXT    NOT NULL CHECK (region_type IN ('metropole', 'outre_mer')),
  zone_code            TEXT    NOT NULL CHECK (zone_code IN (
                         'MET',                               -- Métropole (Corse comprise)
                         'GP', 'MQ', 'GF', 'RE', 'YT',        -- DROM
                         'PM', 'BL', 'MF', 'WF', 'PF', 'NC'   -- COM + Nouvelle-Calédonie
                       )),
  population           INTEGER NOT NULL DEFAULT 0 CHECK (population >= 0),
  area_km2             REAL,
  center_lat           REAL    NOT NULL,
  center_lng           REAL    NOT NULL,

  -- Valeurs calculées par scripts/import (rejouables si l'équilibrage change)
  infra_score          REAL    NOT NULL DEFAULT 0,
  base_value           INTEGER NOT NULL CHECK (base_value > 0),          -- V0
  building_slots       INTEGER NOT NULL CHECK (building_slots BETWEEN 3 AND 16),
  balance_version      INTEGER NOT NULL DEFAULT 1,

  -- Propriété
  owner_id             INTEGER REFERENCES users (id) ON DELETE SET NULL,
  acquired_at          INTEGER,
  acquired_price       INTEGER,
  fortification_value  INTEGER NOT NULL DEFAULT 0 CHECK (fortification_value >= 0), -- F, gagnée en défendant une OPA
  shield_until         INTEGER,                                -- bouclier anti-OPA
  is_capital           INTEGER NOT NULL DEFAULT 0 CHECK (is_capital IN (0, 1)), -- héberge le siège social : immunisé contre les OPA

  data_updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (owner_id IS NOT NULL OR is_capital = 0)
) STRICT;
CREATE INDEX idx_territories_owner ON territories (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_territories_zone  ON territories (zone_code);
CREATE INDEX idx_territories_dept  ON territories (department_code);
CREATE UNIQUE INDEX uq_territories_one_capital_per_owner ON territories (owner_id) WHERE is_capital = 1;

-- Contours GeoJSON simplifiés (table à part pour garder `territories` légère)
CREATE TABLE territory_geometries (
  territory_id  INTEGER PRIMARY KEY REFERENCES territories (id) ON DELETE CASCADE,
  geojson_low   TEXT NOT NULL CHECK (json_valid(geojson_low)),   -- zoom 9-10
  geojson_high  TEXT NOT NULL CHECK (json_valid(geojson_high))   -- zoom >= 11
) STRICT;

-- Index spatial : boîte englobante de chaque commune (requêtes "communes visibles à l'écran")
CREATE VIRTUAL TABLE territories_rtree USING rtree (
  id, min_lng, max_lng, min_lat, max_lat
);

-- Recherche par nom, insensible aux accents ("saint etienne" trouve "Saint-Étienne")
CREATE VIRTUAL TABLE territories_fts USING fts5 (
  name,
  content = 'territories',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER trg_territories_fts_ai AFTER INSERT ON territories BEGIN
  INSERT INTO territories_fts (rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER trg_territories_fts_ad AFTER DELETE ON territories BEGIN
  INSERT INTO territories_fts (territories_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
CREATE TRIGGER trg_territories_fts_au AFTER UPDATE OF name ON territories BEGIN
  INSERT INTO territories_fts (territories_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO territories_fts (rowid, name) VALUES (new.id, new.name);
END;

-- Infrastructures réelles comptées par commune (INSEE BPE + OpenStreetMap)
CREATE TABLE territory_stats (
  territory_id  INTEGER NOT NULL REFERENCES territories (id) ON DELETE CASCADE,
  category      TEXT    NOT NULL CHECK (category IN (
                  'commerce', 'service', 'sante', 'education', 'sport_loisir',
                  'hotel', 'restaurant', 'gare', 'aeroport', 'port',
                  'monument', 'musee_attraction'
                )),
  source        TEXT    NOT NULL CHECK (source IN ('bpe', 'osm')),
  count         INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  imported_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (territory_id, category, source)
) STRICT;

-- Historique des changements de propriétaire (achat, vente, OPA, libération pour inactivité)
CREATE TABLE territory_ownership_history (
  id             INTEGER PRIMARY KEY,
  territory_id   INTEGER NOT NULL REFERENCES territories (id),
  from_user_id   INTEGER REFERENCES users (id),
  to_user_id     INTEGER REFERENCES users (id),
  reason         TEXT    NOT NULL CHECK (reason IN ('purchase', 'sale', 'takeover', 'inactivity_release', 'admin')),
  price          INTEGER,
  takeover_id    INTEGER REFERENCES takeovers (id),
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_ownership_territory ON territory_ownership_history (territory_id, created_at);

-- ---------------------------------------------------------------------
-- Bâtiments
-- ---------------------------------------------------------------------
CREATE TABLE building_types (
  id                     INTEGER PRIMARY KEY,
  code                   TEXT    NOT NULL UNIQUE,
  name                   TEXT    NOT NULL,
  category               TEXT    NOT NULL CHECK (category IN ('logement', 'commerce', 'industrie', 'infrastructure', 'siege')),
  description            TEXT,
  base_cost              INTEGER NOT NULL CHECK (base_cost > 0),       -- coût du niveau 1, avant facteur de taille
  cost_growth            REAL    NOT NULL DEFAULT 1.6 CHECK (cost_growth >= 1),
  base_income_per_hour   INTEGER NOT NULL DEFAULT 0 CHECK (base_income_per_hour >= 0),
  income_growth          REAL    NOT NULL DEFAULT 1.45 CHECK (income_growth >= 1),
  income_bonus_pct       INTEGER NOT NULL DEFAULT 0 CHECK (income_bonus_pct >= 0), -- infrastructure : +x % par niveau sur tout le territoire
  territory_slot_bonus   INTEGER NOT NULL DEFAULT 0,                   -- siège : +x territoires max par niveau
  base_build_seconds     INTEGER NOT NULL CHECK (base_build_seconds > 0),
  time_growth            REAL    NOT NULL DEFAULT 1.5 CHECK (time_growth >= 1),
  max_level              INTEGER NOT NULL DEFAULT 10 CHECK (max_level >= 1),
  slot_size              INTEGER NOT NULL DEFAULT 1 CHECK (slot_size >= 1),
  max_per_territory      INTEGER,                                      -- NULL = illimité (dans la limite des emplacements)
  max_per_user           INTEGER,                                      -- 1 pour le siège social
  min_population         INTEGER NOT NULL DEFAULT 0,
  scales_with_territory  INTEGER NOT NULL DEFAULT 1 CHECK (scales_with_territory IN (0, 1)),
  is_active              INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
) STRICT;

CREATE TABLE buildings (
  id                INTEGER PRIMARY KEY,
  territory_id      INTEGER NOT NULL REFERENCES territories (id) ON DELETE CASCADE,
  building_type_id  INTEGER NOT NULL REFERENCES building_types (id),
  level             INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),     -- niveau actif (0 pendant la 1re construction)
  target_level      INTEGER,                                           -- niveau en cours de construction, NULL si aucun chantier
  works_started_at  INTEGER,
  works_ends_at     INTEGER,
  invested_cash     INTEGER NOT NULL DEFAULT 0 CHECK (invested_cash >= 0), -- B : valeur comptable du bâtiment
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((target_level IS NULL) = (works_ends_at IS NULL)),
  CHECK (target_level IS NULL OR target_level = level + 1)
) STRICT;
CREATE INDEX idx_buildings_territory ON buildings (territory_id);
CREATE INDEX idx_buildings_works     ON buildings (works_ends_at) WHERE works_ends_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- PvP : Offres Publiques d'Achat (OPA)
-- ---------------------------------------------------------------------
CREATE TABLE takeovers (
  id               INTEGER PRIMARY KEY,
  territory_id     INTEGER NOT NULL REFERENCES territories (id),
  attacker_id      INTEGER NOT NULL REFERENCES users (id),
  defender_id      INTEGER NOT NULL REFERENCES users (id),
  territory_value  INTEGER NOT NULL CHECK (territory_value > 0),  -- V_terr figée au lancement
  offer_amount     INTEGER NOT NULL CHECK (offer_amount > 0),     -- prix de l'OPA, bloqué en séquestre chez l'attaquant
  defense_cost     INTEGER NOT NULL CHECK (defense_cost > 0),     -- somme à payer par le défenseur pour garder le territoire
  break_fee        INTEGER NOT NULL CHECK (break_fee >= 0),       -- indemnité versée au défenseur si l'OPA échoue
  status           TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                     'pending',    -- fenêtre de 24 h ouverte
                     'defended',   -- le défenseur a surenchéri : il garde le territoire
                     'accepted',   -- le défenseur a accepté la vente avant la fin
                     'succeeded',  -- fin de la fenêtre sans défense : transfert
                     'cancelled',  -- l'attaquant a retiré son offre
                     'voided'      -- annulée par le système (propriétaire libéré, territoire vendu...)
                   )),
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at       INTEGER NOT NULL,
  resolved_at      INTEGER,
  CHECK (attacker_id <> defender_id),
  CHECK (expires_at > created_at),
  CHECK ((status = 'pending') = (resolved_at IS NULL))
) STRICT;
CREATE UNIQUE INDEX uq_takeovers_one_pending_per_territory ON takeovers (territory_id) WHERE status = 'pending';
CREATE INDEX idx_takeovers_pending_expiry ON takeovers (expires_at) WHERE status = 'pending';
CREATE INDEX idx_takeovers_attacker       ON takeovers (attacker_id, status);
CREATE INDEX idx_takeovers_defender       ON takeovers (defender_id, status);
CREATE INDEX idx_takeovers_pair           ON takeovers (attacker_id, defender_id, created_at);

-- ---------------------------------------------------------------------
-- Portefeuille : journal d'audit en ajout seul (cash ET gemmes)
-- ---------------------------------------------------------------------
CREATE TABLE wallet_transactions (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users (id),
  currency         TEXT    NOT NULL CHECK (currency IN ('cash', 'gems')),
  amount           INTEGER NOT NULL CHECK (amount <> 0),            -- positif = crédit, négatif = débit
  balance_after    INTEGER NOT NULL CHECK (balance_after >= 0),
  reason           TEXT    NOT NULL CHECK (reason IN (
                     'signup_bonus', 'income_collect',
                     'territory_purchase', 'territory_sale',
                     'building_construction', 'building_upgrade', 'building_demolition_refund',
                     'takeover_escrow', 'takeover_refund', 'takeover_payout', 'takeover_break_fee', 'takeover_defense',
                     'inactivity_buyback',
                     'quest_reward', 'tutorial_reward',
                     'shop_purchase', 'gems_purchase', 'gems_refund',
                     'admin_adjustment'
                   )),
  ref_type         TEXT,                                            -- 'territory', 'building', 'takeover', 'user_quest', 'payment_order'...
  ref_id           INTEGER,
  idempotency_key  TEXT    UNIQUE,                                  -- évite de payer deux fois la même action
  metadata         TEXT    CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_wallet_user_time ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX idx_wallet_ref       ON wallet_transactions (ref_type, ref_id);

CREATE TRIGGER trg_wallet_no_update BEFORE UPDATE ON wallet_transactions BEGIN
  SELECT RAISE(ABORT, 'wallet_transactions est en ajout seul');
END;
CREATE TRIGGER trg_wallet_no_delete BEFORE DELETE ON wallet_transactions BEGIN
  SELECT RAISE(ABORT, 'wallet_transactions est en ajout seul');
END;

-- ---------------------------------------------------------------------
-- Tutoriel
-- ---------------------------------------------------------------------
CREATE TABLE tutorials (
  id                INTEGER PRIMARY KEY,
  step_key          TEXT    NOT NULL UNIQUE,
  position          INTEGER NOT NULL UNIQUE,
  title             TEXT    NOT NULL,
  body              TEXT    NOT NULL,
  ui_anchor         TEXT,                                           -- élément à mettre en avant côté front (data-tuto="...")
  completion_event  TEXT    NOT NULL,                               -- événement qui valide l'étape
  validated_by      TEXT    NOT NULL CHECK (validated_by IN ('server', 'client')),
  reward_cash       INTEGER NOT NULL DEFAULT 0 CHECK (reward_cash >= 0),
  reward_gems       INTEGER NOT NULL DEFAULT 0 CHECK (reward_gems >= 0)
) STRICT;

CREATE TABLE user_tutorial_steps (
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tutorial_id   INTEGER NOT NULL REFERENCES tutorials (id),
  completed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, tutorial_id)
) STRICT;

-- ---------------------------------------------------------------------
-- Quêtes journalières : catalogue + 3 quêtes tirées par joueur et par jour
-- ---------------------------------------------------------------------
CREATE TABLE daily_quests (
  id                    INTEGER PRIMARY KEY,
  code                  TEXT    NOT NULL UNIQUE,
  title                 TEXT    NOT NULL,
  description           TEXT    NOT NULL,                           -- "{target}" remplacé par l'objectif tiré
  event_type            TEXT    NOT NULL CHECK (event_type IN (
                          'login', 'income_collected', 'territory_visited', 'zone_visited',
                          'territory_bought', 'building_started', 'building_upgraded',
                          'takeover_launched', 'takeover_defended', 'leaderboard_viewed'
                        )),
  target_min            INTEGER NOT NULL CHECK (target_min >= 1),
  target_max            INTEGER NOT NULL,
  difficulty            TEXT    NOT NULL CHECK (difficulty IN ('facile', 'moyen', 'difficile')),
  reward_income_hours   REAL    NOT NULL DEFAULT 2,                 -- récompense = x heures de revenu du joueur...
  reward_cash_min       INTEGER NOT NULL DEFAULT 1000,              -- ...avec ce minimum
  reward_gems           INTEGER NOT NULL DEFAULT 0,
  min_territories       INTEGER NOT NULL DEFAULT 0,                 -- tirée seulement si le joueur a au moins N territoires
  weight                INTEGER NOT NULL DEFAULT 10 CHECK (weight > 0),
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  CHECK (target_max >= target_min)
) STRICT;

CREATE TABLE user_quests (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest_id      INTEGER NOT NULL REFERENCES daily_quests (id),
  quest_date    TEXT    NOT NULL CHECK (quest_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), -- jour (Europe/Paris)
  slot          INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  target        INTEGER NOT NULL CHECK (target >= 1),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  reward_cash   INTEGER NOT NULL CHECK (reward_cash >= 0),
  reward_gems   INTEGER NOT NULL DEFAULT 0 CHECK (reward_gems >= 0),
  completed_at  INTEGER,
  claimed_at    INTEGER,
  UNIQUE (user_id, quest_date, slot),
  UNIQUE (user_id, quest_date, quest_id),
  CHECK (claimed_at IS NULL OR completed_at IS NOT NULL)
) STRICT;
CREATE INDEX idx_user_quests_day ON user_quests (user_id, quest_date);

-- ---------------------------------------------------------------------
-- Notifications (OPA reçue, OPA résolue, chantier terminé, alerte d'inactivité...)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  payload     TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(payload)),
  read_at     INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------
-- Monétisation V2 (tables prêtes, boutique désactivée en V1)
-- ---------------------------------------------------------------------
CREATE TABLE shop_items (
  id                 INTEGER PRIMARY KEY,
  sku                TEXT    NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  kind               TEXT    NOT NULL CHECK (kind IN ('marker_skin', 'build_queue_slot', 'income_boost', 'territory_slot')),
  price_gems         INTEGER CHECK (price_gems IS NULL OR price_gems > 0),
  price_cash         INTEGER CHECK (price_cash IS NULL OR price_cash > 0), -- certains objets aussi achetables en cash (anti pay-to-win)
  effect             TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(effect)), -- ex. {"income_pct":10} ou {"skin":"tour_eiffel"}
  duration_seconds   INTEGER,                                        -- NULL = permanent
  max_per_user       INTEGER,
  is_active          INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  CHECK (price_gems IS NOT NULL OR price_cash IS NOT NULL)
) STRICT;

CREATE TABLE user_items (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  shop_item_id  INTEGER NOT NULL REFERENCES shop_items (id),
  acquired_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at    INTEGER,                                            -- boosts temporaires
  is_equipped   INTEGER NOT NULL DEFAULT 0 CHECK (is_equipped IN (0, 1)),
  source        TEXT    NOT NULL CHECK (source IN ('shop', 'quest', 'event', 'admin'))
) STRICT;
CREATE INDEX idx_user_items_user ON user_items (user_id, expires_at);

-- Paiements réels (Stripe en V2) : vide en V1
CREATE TABLE payment_orders (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users (id),
  provider           TEXT    NOT NULL CHECK (provider IN ('stripe')),
  provider_ref       TEXT    UNIQUE,                                -- id de session/paiement Stripe
  amount_eur_cents   INTEGER NOT NULL CHECK (amount_eur_cents > 0),
  gems_granted       INTEGER NOT NULL CHECK (gems_granted > 0),
  status             TEXT    NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_payment_orders_user ON payment_orders (user_id, created_at);

-- ---------------------------------------------------------------------
-- Tâches planifiées : journal et verrou (une exécution à la fois)
-- ---------------------------------------------------------------------
CREATE TABLE job_runs (
  id           INTEGER PRIMARY KEY,
  job_name     TEXT    NOT NULL,
  started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at  INTEGER,
  status       TEXT    NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  details      TEXT
) STRICT;
CREATE INDEX idx_job_runs_name ON job_runs (job_name, started_at DESC);
CREATE UNIQUE INDEX uq_job_runs_one_running ON job_runs (job_name) WHERE status = 'running';
