// Point d'entrée : `npm run dev` (rechargement à chaud) ou `npm start -w backend`.
import { construireApp } from './app.ts';
import { chargerFichierEnv, lireConfig } from './config.ts';
import { fermerBase, ouvrirBase } from './db/connexion.ts';
import { appliquerMigrations } from './db/migrations.ts';
import { demarrerTaches } from './jobs/taches.ts';

chargerFichierEnv();
const config = lireConfig();

const logger =
  config.NODE_ENV === 'production'
    ? { level: config.LOG_LEVEL }
    : {
        level: config.LOG_LEVEL,
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
      };

const db = ouvrirBase(config.cheminBase);
const enProduction = config.NODE_ENV === 'production';
const app = construireApp({
  db,
  logger,
  auth: {
    googleClientId: config.GOOGLE_CLIENT_ID || null,
    // Double garde : lireConfig refuse déjà AUTH_DEV en production.
    devLogin: config.AUTH_DEV && !enProduction,
    cookieSecure: enProduction,
  },
  securite: { origine: config.APP_ORIGIN },
  adminEmails: config.ADMIN_EMAILS,
});
if (config.ADMIN_EMAILS.length === 0) app.log.warn('ADMIN_EMAILS vide : aucun admin d’office pour /admin');
if (config.AUTH_DEV && !enProduction) {
  app.log.warn('connexion de développement active (AUTH_DEV=true) : pour tester en local, jamais en production');
}
if (!config.GOOGLE_CLIENT_ID) app.log.warn('GOOGLE_CLIENT_ID vide : connexion Google désactivée');

const { appliquees } = appliquerMigrations(db);
if (appliquees.length > 0) app.log.info({ appliquees }, 'migrations appliquées');

// Tâches planifiées (OPA échues…) : arrêtées avant la fermeture de la base.
const arreterTaches = demarrerTaches(db, app.log);
app.addHook('onClose', async () => {
  arreterTaches();
  fermerBase(db);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'arrêt du serveur');
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (erreur) {
  app.log.fatal({ err: erreur }, 'démarrage impossible');
  fermerBase(db);
  process.exit(1);
}
