import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Base } from './connexion.ts';

export const DOSSIER_MIGRATIONS = join(import.meta.dirname, 'migrations');

export interface Migration {
  /** '001', '002'... */
  version: string;
  /** Nom du fichier, ex. '001_initial.sql'. */
  name: string;
  sql: string;
  /** SHA-256 du fichier (fins de ligne normalisées) : détecte une migration modifiée après coup. */
  checksum: string;
}

/** Lit `NNN_nom.sql` dans l'ordre des numéros. */
export function lireMigrations(dossier = DOSSIER_MIGRATIONS): Migration[] {
  return readdirSync(dossier)
    .filter((fichier) => /^\d{3}_[\w-]+\.sql$/.test(fichier))
    .sort()
    .map((fichier) => {
      const sql = readFileSync(join(dossier, fichier), 'utf8').replace(/\r\n/g, '\n');
      return {
        version: fichier.slice(0, 3),
        name: fichier,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

const CREER_TABLE_SUIVI = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  checksum    TEXT    NOT NULL,
  applied_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT`;

/**
 * Applique les migrations pas encore jouées, chacune dans sa transaction
 * (`BEGIN IMMEDIATE`), et les note dans `schema_migrations`.
 * Refuse de démarrer si une migration déjà appliquée a changé (ajout seul).
 */
export function appliquerMigrations(db: Base, dossier = DOSSIER_MIGRATIONS): { appliquees: string[] } {
  db.exec(CREER_TABLE_SUIVI);

  const dejaJouees = new Map(
    db
      .prepare<[], { version: string; name: string; checksum: string }>(
        'SELECT version, name, checksum FROM schema_migrations',
      )
      .all()
      .map((ligne) => [ligne.version, ligne]),
  );
  const migrations = lireMigrations(dossier);
  const connues = new Set(migrations.map((m) => m.version));

  for (const version of dejaJouees.keys()) {
    if (!connues.has(version)) {
      throw new Error(`La base contient la migration ${version}, absente du code : le code est-il à jour ?`);
    }
  }

  const noter = db.prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)');
  const appliquees: string[] = [];

  for (const migration of migrations) {
    const trace = dejaJouees.get(migration.version);
    if (trace) {
      if (trace.checksum !== migration.checksum) {
        throw new Error(
          `La migration ${migration.name} a été modifiée après avoir été appliquée. ` +
            'Les migrations sont en ajout seul : écrire une nouvelle migration.',
        );
      }
      continue;
    }
    db.transaction(() => {
      db.exec(migration.sql);
      noter.run(migration.version, migration.name, migration.checksum);
    }).immediate();
    appliquees.push(migration.name);
  }

  return { appliquees };
}

/** Dernière version appliquée ('002'...), ou `null` sur une base vide. */
export function versionDuSchema(db: Base): string | null {
  const existe = db
    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'")
    .pluck()
    .get();
  if (!existe) return null;
  return (db.prepare('SELECT max(version) FROM schema_migrations').pluck().get() as string | null) ?? null;
}
