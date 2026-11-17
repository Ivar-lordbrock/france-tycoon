import etag from '@fastify/etag';
import {
  rechercheQuerySchema,
  rechercheReponseSchema,
  territoiresQuerySchema,
  ZONES,
  type ZonesReponse,
  zonesReponseSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { creerRequetesCarte } from './requetes.ts';

/** Les 12 zones, leur boîte et le zoom conseillé (générés par l'import des communes). */
const REPONSE_ZONES: ZonesReponse = {
  zones: ZONES.map(({ code, nom, bbox, zoom }) => ({ code, name: nom, bbox, zoom })),
};

/** Routes publiques /map : zones, communes visibles, recherche. */
export const routesCarte: FastifyPluginAsyncZod = async (app) => {
  // ETag calculé sur la réponse : le front revalide sa cache par case de carte (304 sans corps).
  await app.register(etag);
  const requetes = creerRequetesCarte(app.db);

  app.get('/zones', { schema: { response: { 200: zonesReponseSchema } } }, (_req, reply) => {
    reply.header('cache-control', 'public, max-age=86400');
    return REPONSE_ZONES;
  });

  app.get('/territories', { schema: { querystring: territoiresQuerySchema } }, (req, reply) => {
    const { json, total, tronque } = requetes.communesVisibles(req.query.bbox, req.query.zoom, req.joueur?.id ?? null);
    if (tronque) req.log.warn({ bbox: req.query.bbox, zoom: req.query.zoom }, 'réponse carte tronquée');
    reply
      .header('cache-control', 'private, no-cache')
      .header('x-total-count', total)
      .type('application/json; charset=utf-8');
    return reply.send(json);
  });

  app.get(
    '/search',
    { schema: { querystring: rechercheQuerySchema, response: { 200: rechercheReponseSchema } } },
    (req, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return { results: requetes.rechercher(req.query.q) };
    },
  );
};
