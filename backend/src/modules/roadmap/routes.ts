import { type FonctionnalitePrevue, feuilleDeRouteReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

type Ligne = Omit<FonctionnalitePrevue, 'details'> & { details: string };

/** GET /roadmap : publique (pas besoin d'être connecté), simple lecture de `roadmap_features` (migration 009). */
export const routesFeuilleDeRoute: FastifyPluginAsyncZod = async (app) => {
  const lire = app.db.prepare<[], Ligne>(
    'SELECT code, category, status, title, summary, details FROM roadmap_features ORDER BY position, id',
  );

  app.get('/', { schema: { response: { 200: feuilleDeRouteReponseSchema } } }, (_req, reply) => {
    // Ne change qu'avec une migration : 5 minutes de cache suffisent.
    reply.header('cache-control', 'public, max-age=300');
    return { features: lire.all().map((l) => ({ ...l, details: JSON.parse(l.details) as string[] })) };
  });
};
