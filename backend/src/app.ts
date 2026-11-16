import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Base } from './db/connexion.ts';
import { brancherGestionErreurs } from './erreurs.ts';
import { routesAdmin } from './modules/admin/routes.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Base;
  }
}

export interface OptionsApp {
  db: Base;
  logger?: FastifyServerOptions['logger'];
}

/** Construit l'application sans l'écouter : utilisée par `server.ts` et par les tests (`app.inject`). */
export function construireApp({ db, logger = false }: OptionsApp) {
  const app = Fastify({ logger, trustProxy: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  brancherGestionErreurs(app);

  app.register(routesAdmin, { prefix: '/api/v1/admin' });

  return app;
}

export type App = ReturnType<typeof construireApp>;
