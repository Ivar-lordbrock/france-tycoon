// Vérifie que les migrations s'appliquent et que la base refuse les états interdits.
// Lancer : node --test backend/   (Node >= 22.13, aucune dépendance : module intégré node:sqlite)

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  db.exec(`
    INSERT INTO users (google_id, email, pseudo, cash) VALUES ('g1', 'a@exemple.fr', 'Alice', 30000), ('g2', 'b@exemple.fr', 'Bob', 30000);
    INSERT INTO territories (insee_code, name, department_code, region_code, region_type, zone_code, population, center_lat, center_lng, infra_score, base_value, building_slots)
    VALUES ('01001', 'L''Abergement-Clémenciat', '01', '84', 'metropole', 'MET', 860, 46.15, 4.92, 7, 21800, 7),
           ('97120', 'Pointe-à-Pitre', '971', '01', 'outre_mer', 'GP', 15040, 16.24, -61.53, 1702, 636700, 10);
    INSERT INTO territories_rtree VALUES (1, 4.88, 4.97, 46.13, 46.18), (2, -61.55, -61.51, 16.22, 16.26);
    UPDATE territories SET owner_id = 1, acquired_at = unixepoch(), acquired_price = 21800 WHERE id = 1;
    INSERT INTO wallet_transactions (user_id, currency, amount, balance_after, reason, ref_type, ref_id, idempotency_key)
    VALUES (1, 'cash', -21800, 8200, 'territory_purchase', 'territory', 1, 'achat-1');
    INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost, break_fee, expires_at)
    VALUES (1, 2, 1, 26230, 39400, 9200, 2000, unixepoch() + 86400);
  `);
  return db;
}

test('les catalogues sont remplis', () => {
  const db = freshDb();
  const count = (t) => db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
  assert.equal(count('building_types'), 7);
  assert.equal(db.prepare('SELECT max(max_level) AS n FROM building_types').get().n, 5, '5 niveaux au plus (003)');
  assert.equal(count('tutorials'), 10);
  assert.ok(count('daily_quests') >= 9);
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM shop_items WHERE is_active = 1').get().n,
    0,
    'boutique fermée en V1',
  );
});

test('recherche par nom sans accents (FTS5)', () => {
  const db = freshDb();
  const rows = db.prepare("SELECT rowid FROM territories_fts WHERE territories_fts MATCH 'clemenciat'").all();
  assert.deepEqual(
    rows.map((r) => r.rowid),
    [1],
  );
});

test("index spatial : communes visibles dans l'écran (R*Tree)", () => {
  const db = freshDb();
  const rows = db
    .prepare('SELECT id FROM territories_rtree WHERE max_lng >= ? AND min_lng <= ? AND max_lat >= ? AND min_lat <= ?')
    .all(-62, -61, 16, 17);
  assert.deepEqual(
    rows.map((r) => r.id),
    [2],
  );
});

test('bouclier débutant de 72 h à la création du compte', () => {
  const db = freshDb();
  assert.equal(db.prepare('SELECT newbie_shield_until - created_at AS d FROM users WHERE id = 1').get().d, 259200);
});

const forbidden = {
  'argent négatif': 'UPDATE users SET cash = -1 WHERE id = 1',
  'texte dans une colonne entière (STRICT)': "UPDATE users SET cash = 'beaucoup' WHERE id = 1",
  'commune hors de France':
    "INSERT INTO territories (insee_code, name, department_code, region_type, zone_code, center_lat, center_lng, base_value, building_slots) VALUES ('99134', 'Madrid', '99', 'metropole', 'ES', 40.4, -3.7, 1000, 5)",
  'code INSEE invalide':
    "INSERT INTO territories (insee_code, name, department_code, region_type, zone_code, center_lat, center_lng, base_value, building_slots) VALUES ('1001', 'X', '01', 'metropole', 'MET', 0, 0, 1000, 5)",
  'deux OPA en cours sur la même commune':
    'INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost, break_fee, expires_at) VALUES (1, 2, 1, 1, 1, 1, 0, unixepoch() + 10)',
  'OPA sur soi-même':
    'INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost, break_fee, expires_at) VALUES (2, 1, 1, 1, 1, 1, 0, unixepoch() + 10)',
  'OPA résolue sans date de résolution': "UPDATE takeovers SET status = 'defended' WHERE id = 1",
  'modifier le journal du portefeuille': 'UPDATE wallet_transactions SET amount = 1 WHERE id = 1',
  'effacer le journal du portefeuille': 'DELETE FROM wallet_transactions WHERE id = 1',
  "réutiliser une clé d'idempotence":
    "INSERT INTO wallet_transactions (user_id, currency, amount, balance_after, reason, idempotency_key) VALUES (1, 'cash', -1, 1, 'territory_purchase', 'achat-1')",
  'devise inconnue':
    "INSERT INTO wallet_transactions (user_id, currency, amount, balance_after, reason) VALUES (1, 'euros', 5, 5, 'admin_adjustment')",
  'chantier sans date de fin':
    'INSERT INTO buildings (territory_id, building_type_id, level, target_level) VALUES (1, 1, 0, 1)',
  'sauter un niveau':
    'INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_ends_at, works_cost) VALUES (1, 1, 1, 3, unixepoch(), 100)',
  'chantier sans prix payé':
    'INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_ends_at) VALUES (1, 1, 0, 1, unixepoch())',
  'prix de chantier sans chantier':
    'INSERT INTO buildings (territory_id, building_type_id, level, works_cost) VALUES (1, 1, 1, 100)',
  'chantier gratuit':
    'INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_ends_at, works_cost) VALUES (1, 1, 0, 1, unixepoch(), 0)',
  'capitale sans propriétaire': 'UPDATE territories SET is_capital = 1 WHERE id = 2',
  'pseudo trop court': "INSERT INTO users (google_id, email, pseudo) VALUES ('g3', 'c@exemple.fr', 'Al')",
  'pseudo déjà pris (casse différente)':
    "INSERT INTO users (google_id, email, pseudo) VALUES ('g3', 'c@exemple.fr', 'alice')",
  'quatrième quête du jour':
    "INSERT INTO user_quests (user_id, quest_id, quest_date, slot, target, reward_cash) VALUES (1, 1, '2026-11-15', 4, 1, 100)",
};

for (const [label, sql] of Object.entries(forbidden)) {
  test(`refusé : ${label}`, () => {
    const db = freshDb();
    assert.throws(() => db.exec(sql));
  });
}

test('une OPA défendue libère la place pour une nouvelle', () => {
  const db = freshDb();
  db.exec("UPDATE takeovers SET status = 'defended', resolved_at = unixepoch() WHERE id = 1");
  assert.doesNotThrow(() =>
    db.exec(
      'INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost, break_fee, expires_at) VALUES (1, 2, 1, 1, 1, 1, 0, unixepoch() + 10)',
    ),
  );
});

test('un chantier noté avec son prix est accepté, puis terminé', () => {
  const db = freshDb();
  assert.doesNotThrow(() => {
    db.exec(
      'INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_started_at, works_ends_at, works_cost, invested_cash) VALUES (1, 1, 0, 1, unixepoch(), unixepoch() + 600, 4430, 4430)',
    );
    db.exec(
      'UPDATE buildings SET level = 1, target_level = NULL, works_ends_at = NULL, works_cost = NULL WHERE id = 1',
    );
  });
});

test('les tâches planifiées utilisent leurs index', () => {
  const db = freshDb();
  const plan = (sql) => JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all());
  assert.match(
    plan("SELECT id FROM takeovers WHERE status = 'pending' AND expires_at <= unixepoch()"),
    /idx_takeovers_pending_expiry/,
  );
  assert.match(
    plan("SELECT id FROM users WHERE status = 'active' AND last_active_at < unixepoch() - 1209600"),
    /idx_users_inactivity/,
  );
});

test('clés étrangères cohérentes', () => {
  const db = freshDb();
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
