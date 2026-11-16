import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Base = Database.Database;

/**
 * Ouvre la base SQLite avec les réglages de `001_initial.sql` :
 * WAL (lecteurs et écrivain en parallèle), clés étrangères, attente de 5 s
 * si la base est verrouillée, `synchronous = NORMAL` (sûr en WAL).
 */
export function ouvrirBase(chemin: string): Base {
  const enMemoire = chemin === ':memory:';
  if (!enMemoire) mkdirSync(dirname(chemin), { recursive: true });

  const db = new Database(chemin);
  if (!enMemoire) db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

/** Ferme proprement : met à jour les statistiques du planificateur puis libère le fichier. */
export function fermerBase(db: Base): void {
  if (!db.open) return;
  db.pragma('optimize');
  db.close();
}
