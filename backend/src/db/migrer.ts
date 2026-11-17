// `npm run db:migrate` : crée la base si besoin et applique les migrations en attente.
import { chargerFichierEnv, lireConfig } from '../config.ts';
import { fermerBase, ouvrirBase } from './connexion.ts';
import { appliquerMigrations, versionDuSchema } from './migrations.ts';

chargerFichierEnv();
const config = lireConfig();
const db = ouvrirBase(config.cheminBase);
try {
  const { appliquees } = appliquerMigrations(db);
  console.log(
    appliquees.length > 0 ? `Migrations appliquées : ${appliquees.join(', ')}` : 'Aucune migration en attente.',
    `(schéma ${versionDuSchema(db)}, base ${config.cheminBase})`,
  );
} finally {
  fermerBase(db);
}
