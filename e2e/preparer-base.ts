// Base de l'essai Playwright : neuve à chaque lancement, avec deux communes carrées (sans importer les vraies données).
import { rmSync } from 'node:fs';
import { fermerBase, ouvrirBase } from '../backend/src/db/connexion.ts';
import { appliquerMigrations } from '../backend/src/db/migrations.ts';
import { insererCommunes } from '../backend/src/outils-test/communes.ts';

const chemin = process.env.DATABASE_PATH;
if (!chemin) throw new Error('DATABASE_PATH manquant (lancer avec `npm run test:e2e`)');
for (const fin of ['', '-wal', '-shm']) rmSync(chemin + fin, { force: true });

const db = ouvrirBase(chemin);
appliquerMigrations(db);
insererCommunes(db, [
  { insee: '42901', nom: 'Testville', population: 2000 },
  { insee: '42902', nom: 'Essaibourg', carre: [4.4, 45.4, 0.1] },
]);
fermerBase(db);
