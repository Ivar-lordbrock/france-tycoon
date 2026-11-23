import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ouvrirBase } from './connexion.ts';
import { appliquerMigrations, lireMigrations, versionDuSchema } from './migrations.ts';

const dossiers: string[] = [];

function dossierMigrations(fichiers: Record<string, string>): string {
  const dossier = mkdtempSync(join(tmpdir(), 'ft-migrations-'));
  dossiers.push(dossier);
  for (const [nom, sql] of Object.entries(fichiers)) writeFileSync(join(dossier, nom), sql);
  return dossier;
}

afterEach(() => {
  for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
});

describe('exécuteur de migrations', () => {
  it('applique les migrations du dépôt et les note dans schema_migrations', () => {
    const db = ouvrirBase(':memory:');
    expect(versionDuSchema(db)).toBeNull();

    const { appliquees } = appliquerMigrations(db);

    expect(appliquees).toEqual([
      '001_initial.sql',
      '002_seed.sql',
      '003_economie_etape3.sql',
      '004_reste_revenus.sql',
      '005_deplacement_capitale.sql',
      '006_quetes.sql',
      '007_tutoriel_ordre.sql',
    ]);
    expect(versionDuSchema(db)).toBe('007');
    expect(db.prepare('SELECT count(*) FROM building_types').pluck().get()).toBe(7);
    const traces = db.prepare('SELECT version, name, length(checksum) AS l FROM schema_migrations').all();
    expect(traces).toEqual([
      { version: '001', name: '001_initial.sql', l: 64 },
      { version: '002', name: '002_seed.sql', l: 64 },
      { version: '003', name: '003_economie_etape3.sql', l: 64 },
      { version: '004', name: '004_reste_revenus.sql', l: 64 },
      { version: '005', name: '005_deplacement_capitale.sql', l: 64 },
      { version: '006', name: '006_quetes.sql', l: 64 },
      { version: '007', name: '007_tutoriel_ordre.sql', l: 64 },
    ]);
  });

  it('003 donne un territoire de plus aux joueurs déjà inscrits (4 au départ)', () => {
    const [m001, m002] = lireMigrations();
    if (!m001 || !m002) throw new Error('migrations 001 et 002 introuvables');
    const avant003 = dossierMigrations({ [m001.name]: m001.sql, [m002.name]: m002.sql });
    const db = ouvrirBase(':memory:');
    appliquerMigrations(db, avant003);
    db.exec("INSERT INTO users (google_id, email, pseudo) VALUES ('g1', 'a@exemple.fr', 'Alice')");

    expect(appliquerMigrations(db).appliquees[0]).toBe('003_economie_etape3.sql');
    expect(db.prepare('SELECT max_territories FROM users').pluck().get()).toBe(4);
  });

  it('ne rejoue rien au deuxième lancement', () => {
    const db = ouvrirBase(':memory:');
    appliquerMigrations(db);
    expect(appliquerMigrations(db).appliquees).toEqual([]);
  });

  it('applique seulement les nouvelles migrations, dans l’ordre des numéros', () => {
    const dossier = dossierMigrations({
      '002_b.sql': 'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;',
      '001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
      'notes.txt': 'ignoré',
    });
    const db = ouvrirBase(':memory:');
    expect(appliquerMigrations(db, dossier).appliquees).toEqual(['001_a.sql', '002_b.sql']);

    writeFileSync(join(dossier, '003_c.sql'), 'CREATE TABLE c (id INTEGER PRIMARY KEY) STRICT;');
    expect(appliquerMigrations(db, dossier).appliquees).toEqual(['003_c.sql']);
  });

  it('annule une migration en échec (rien à moitié appliqué)', () => {
    const dossier = dossierMigrations({
      '001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT; INSERT INTO table_absente VALUES (1);',
    });
    const db = ouvrirBase(':memory:');
    expect(() => appliquerMigrations(db, dossier)).toThrow(/table_absente/);
    expect(db.prepare("SELECT count(*) FROM sqlite_schema WHERE name = 'a'").pluck().get()).toBe(0);
    expect(db.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(0);
  });

  it('refuse une migration modifiée après coup', () => {
    const dossier = dossierMigrations({ '001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;' });
    const db = ouvrirBase(':memory:');
    appliquerMigrations(db, dossier);

    writeFileSync(join(dossier, '001_a.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY, x TEXT) STRICT;');
    expect(() => appliquerMigrations(db, dossier)).toThrow(/modifiée après avoir été appliquée/);
  });

  it('refuse une base plus récente que le code', () => {
    const dossier = dossierMigrations({ '001_a.sql': 'SELECT 1;' });
    const db = ouvrirBase(':memory:');
    appliquerMigrations(db, dossier);
    db.prepare("INSERT INTO schema_migrations (version, name, checksum) VALUES ('009', '009_futur.sql', 'x')").run();
    expect(() => appliquerMigrations(db, dossier)).toThrow(/009/);
  });

  it('ne dépend pas des fins de ligne (CRLF sous Windows)', () => {
    const lf = dossierMigrations({ '001_a.sql': 'SELECT 1;\nSELECT 2;\n' });
    const crlf = dossierMigrations({ '001_a.sql': 'SELECT 1;\r\nSELECT 2;\r\n' });
    expect(lireMigrations(lf)[0]?.checksum).toBe(lireMigrations(crlf)[0]?.checksum);
  });
});
