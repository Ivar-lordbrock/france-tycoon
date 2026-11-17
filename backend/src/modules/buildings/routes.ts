import {
  annulationReponseSchema,
  batimentParamsSchema,
  catalogueBatimentsSchema,
  chantierReponseSchema,
  demolitionReponseSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { exigerJoueur } from '../auth/requete.ts';
import { cleIdempotence } from '../wallet/idempotence.ts';
import { creerLecteurCatalogue } from './catalogue.ts';
import { creerChantiers } from './chantiers.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Route publique /building-types : le catalogue, pour les aperçus de coût, revenu et durée. */
export const routesCatalogueBatiments: FastifyPluginAsyncZod = async (app) => {
  const lireCatalogue = creerLecteurCatalogue(app.db);

  app.get('/', { schema: { response: { 200: catalogueBatimentsSchema } } }, (_req, reply) => {
    // Ne change qu'avec une migration (donc une mise en ligne) : une heure de cache suffit.
    reply.header('cache-control', 'public, max-age=3600');
    return { buildingTypes: lireCatalogue() };
  });
};

/** Routes 🔒 /buildings/:id : améliorer, annuler le chantier, démolir (construire : POST /territories/:insee/buildings). */
export const routesBatiments: FastifyPluginAsyncZod = async (app) => {
  const { ameliorer, annuler, demolir } = creerChantiers(app.db);

  app.post(
    '/:id/upgrade',
    { schema: { params: batimentParamsSchema, response: { 200: chantierReponseSchema } } },
    (req) => {
      const moi = exigerJoueur(req);
      return ameliorer(moi, req.params.id, maintenant(), cleIdempotence(req, 'amelioration', moi));
    },
  );

  app.post(
    '/:id/cancel',
    { schema: { params: batimentParamsSchema, response: { 200: annulationReponseSchema } } },
    (req) => {
      const moi = exigerJoueur(req);
      return annuler(moi, req.params.id, maintenant(), cleIdempotence(req, 'annulation', moi));
    },
  );

  app.delete('/:id', { schema: { params: batimentParamsSchema, response: { 200: demolitionReponseSchema } } }, (req) =>
    demolir(exigerJoueur(req), req.params.id, maintenant()),
  );
};
