import { catalogueBatimentsSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { creerLecteurCatalogue } from './catalogue.ts';

/** Route publique /building-types : le catalogue, pour les aperçus de coût, revenu et durée. */
export const routesCatalogueBatiments: FastifyPluginAsyncZod = async (app) => {
  const lireCatalogue = creerLecteurCatalogue(app.db);

  app.get('/', { schema: { response: { 200: catalogueBatimentsSchema } } }, (_req, reply) => {
    // Ne change qu'avec une migration (donc une mise en ligne) : une heure de cache suffit.
    reply.header('cache-control', 'public, max-age=3600');
    return { buildingTypes: lireCatalogue() };
  });
};
