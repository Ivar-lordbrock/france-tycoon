import { detailOpaReponseSchema, opaParamsSchema, opaReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { exigerJoueur } from '../auth/requete.ts';
import { cleIdempotence } from '../wallet/idempotence.ts';
import { creerReponsesOpa } from './reponses.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Routes 🔒 /takeovers/:id : le détail d'une OPA et les réponses (défendre, accepter, retirer). */
export const routesOpa: FastifyPluginAsyncZod = async (app) => {
  const { defendre, accepter, retirer, detail } = creerReponsesOpa(app.db);
  const schema = { params: opaParamsSchema, response: { 200: opaReponseSchema } };

  app.get('/:id', { schema: { params: opaParamsSchema, response: { 200: detailOpaReponseSchema } } }, (req, reply) => {
    const moi = exigerJoueur(req);
    reply.header('cache-control', 'private, no-store');
    return { takeover: detail(moi, req.params.id, maintenant()) };
  });

  app.post('/:id/defend', { schema }, (req) => {
    const moi = exigerJoueur(req);
    return defendre(moi, req.params.id, maintenant(), cleIdempotence(req, 'defense-opa', moi));
  });

  app.post('/:id/accept', { schema }, (req) => accepter(exigerJoueur(req), req.params.id, maintenant()));

  app.post('/:id/cancel', { schema }, (req) => {
    const moi = exigerJoueur(req);
    return retirer(moi, req.params.id, maintenant(), cleIdempotence(req, 'retrait-opa', moi));
  });
};
