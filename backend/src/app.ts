import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Base } from './db/connexion.ts';
import { brancherGestionErreurs } from './erreurs.ts';
import { routesAdmin } from './modules/admin/routes.ts';
import { brancherSessions } from './modules/auth/requete.ts';
import { type OptionsAuth, routesAuth } from './modules/auth/routes.ts';
import { routesBatiments, routesCatalogueBatiments } from './modules/buildings/routes.ts';
import { routesSuivi } from './modules/evenements/suivi.ts';
import { routesClassement, routesJoueurs } from './modules/leaderboard/routes.ts';
import { routesCarte } from './modules/map/routes.ts';
import { routesMoi } from './modules/me/routes.ts';
import { type OptionsDirect, routesDirect } from './modules/notifications/routes.ts';
import { routesQuetes } from './modules/quests/routes.ts';
import { routesFeuilleDeRoute } from './modules/roadmap/routes.ts';
import { routesOpa } from './modules/takeovers/routes.ts';
import { routesTerritoires } from './modules/territories/routes.ts';
import { routesTutoriel } from './modules/tutorial/routes.ts';
import { brancherSecurite, type OptionsSecurite } from './securite.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Base;
  }
}

export interface OptionsApp {
  db: Base;
  logger?: FastifyServerOptions['logger'];
  /** Connexion : Google désactivé, pas de connexion de développement, cookie non `Secure` par défaut. */
  auth?: Partial<OptionsAuth>;
  /** Flux en direct `/events` : passage toutes les secondes par défaut. */
  direct?: OptionsDirect;
  /** Contrôle `Origin` + limite de débit : branchés par `server.ts`, absents des tests (sauf `securite.spec.ts`). */
  securite?: OptionsSecurite;
}

/** Construit l'application sans l'écouter : utilisée par `server.ts` et par les tests (`app.inject`). */
export function construireApp({ db, logger = false, auth = {}, direct = {}, securite }: OptionsApp) {
  const app = Fastify({ logger, trustProxy: true }).withTypeProvider<ZodTypeProvider>();
  const optionsAuth: OptionsAuth = { googleClientId: null, devLogin: false, cookieSecure: false, ...auth };

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  brancherGestionErreurs(app);
  brancherSessions(app, { cookieSecure: optionsAuth.cookieSecure });
  if (securite) brancherSecurite(app, securite);

  app.register(routesAdmin, { prefix: '/api/v1/admin' });
  app.register(routesAuth, { prefix: '/api/v1/auth', ...optionsAuth });
  app.register(routesCatalogueBatiments, { prefix: '/api/v1/building-types' });
  app.register(routesBatiments, { prefix: '/api/v1/buildings' });
  app.register(routesMoi, { prefix: '/api/v1/me' });
  app.register(routesQuetes, { prefix: '/api/v1/me/quests' });
  app.register(routesDirect, { prefix: '/api/v1/events', ...direct });
  app.register(routesSuivi, { prefix: '/api/v1/events' });
  app.register(routesClassement, { prefix: '/api/v1/leaderboard' });
  app.register(routesCarte, { prefix: '/api/v1/map' });
  app.register(routesJoueurs, { prefix: '/api/v1/players' });
  app.register(routesFeuilleDeRoute, { prefix: '/api/v1/roadmap' });
  app.register(routesTerritoires, { prefix: '/api/v1/territories' });
  app.register(routesOpa, { prefix: '/api/v1/takeovers' });
  app.register(routesTutoriel, { prefix: '/api/v1/tutorial' });

  return app;
}

export type App = ReturnType<typeof construireApp>;
