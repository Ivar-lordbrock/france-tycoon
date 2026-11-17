import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Base } from './db/connexion.ts';
import { brancherGestionErreurs } from './erreurs.ts';
import { routesAdmin } from './modules/admin/routes.ts';
import { brancherSessions } from './modules/auth/requete.ts';
import { type OptionsAuth, routesAuth } from './modules/auth/routes.ts';
import { routesCarte } from './modules/map/routes.ts';
import { routesMoi } from './modules/me/routes.ts';
import { routesTerritoires } from './modules/territories/routes.ts';

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
}

/** Construit l'application sans l'écouter : utilisée par `server.ts` et par les tests (`app.inject`). */
export function construireApp({ db, logger = false, auth = {} }: OptionsApp) {
  const app = Fastify({ logger, trustProxy: true }).withTypeProvider<ZodTypeProvider>();
  const optionsAuth: OptionsAuth = { googleClientId: null, devLogin: false, cookieSecure: false, ...auth };

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  brancherGestionErreurs(app);
  brancherSessions(app, { cookieSecure: optionsAuth.cookieSecure });

  app.register(routesAdmin, { prefix: '/api/v1/admin' });
  app.register(routesAuth, { prefix: '/api/v1/auth', ...optionsAuth });
  app.register(routesMoi, { prefix: '/api/v1/me' });
  app.register(routesCarte, { prefix: '/api/v1/map' });
  app.register(routesTerritoires, { prefix: '/api/v1/territories' });

  return app;
}

export type App = ReturnType<typeof construireApp>;
