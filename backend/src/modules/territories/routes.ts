import { ficheCommuneSchema, inseeParamsSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { creerLecteurFiche } from './fiche.ts';

/** Routes /territories : la fiche d'une commune (publique ; les actions dépendent du joueur connecté). */
export const routesTerritoires: FastifyPluginAsyncZod = async (app) => {
  const lireFiche = creerLecteurFiche(app.db);

  app.get('/:insee', { schema: { params: inseeParamsSchema, response: { 200: ficheCommuneSchema } } }, (req, reply) => {
    const fiche = lireFiche(req.params.insee, req.joueur?.id ?? null, Math.floor(Date.now() / 1000));
    if (!fiche) {
      throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune française avec le code ${req.params.insee}.`);
    }
    reply.header('cache-control', 'private, no-cache');
    return fiche;
  });
};
