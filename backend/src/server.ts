// Point d'entrée : `npm run dev` (rechargement à chaud) ou `npm start -w backend`.
import { construireApp } from './app.ts';
import { chargerFichierEnv, lireConfig } from './config.ts';
import { fermerBase, ouvrirBase } from './db/connexion.ts';
import { appliquerMigrations } from './db/migrations.ts';

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
const app = construireApp({ db, logger });

const { appliquees } = appliquerMigrations(db);
if (appliquees.length > 0) app.log.info({ appliquees }, 'migrations appliquées');

app.addHook('onClose', async () => fermerBase(db));

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
