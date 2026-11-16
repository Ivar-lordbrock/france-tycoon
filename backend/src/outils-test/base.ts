import { construireApp } from '../app.ts';
import { type Base, ouvrirBase } from '../db/connexion.ts';
import { appliquerMigrations } from '../db/migrations.ts';

/** Base en mémoire avec toutes les migrations : une par test, rien ne fuit entre les tests. */
export function baseDeTest(): Base {
  const db = ouvrirBase(':memory:');
  appliquerMigrations(db);
  return db;
}

export function appDeTest(db: Base = baseDeTest()) {
  return construireApp({ db });
}
