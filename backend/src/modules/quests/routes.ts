import { queteParamsSchema, quetesReponseSchema, reclamerQueteReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { exigerJoueur } from '../auth/requete.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { cleIdempotence } from '../wallet/idempotence.ts';
import { creerQuetes } from './quetes.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Routes 🔒 /me/quests : les 3 quêtes du jour et la réclamation d'une récompense (docs/04, docs/05 5.7). */
export const routesQuetes: FastifyPluginAsyncZod = async (app) => {
  const quetes = creerQuetes(app.db);
  const encaisser = creerEncaisseur(app.db);

  app.get('/', { schema: { response: { 200: quetesReponseSchema } } }, (req, reply) => {
    const moi = exigerJoueur(req);
    const t = maintenant();
    reply.header('cache-control', 'private, no-store');
    return app.db
      .transaction(() => {
        encaisser(moi, t); // un chantier fini pendant l'absence fait avancer ses quêtes
        return quetes.quetesDuJour(moi, t);
      })
      .immediate();
  });

  app.post(
    '/:id/claim',
    { schema: { params: queteParamsSchema, response: { 200: reclamerQueteReponseSchema } } },
    (req) => {
      const moi = exigerJoueur(req);
      const t = maintenant();
      const cle = cleIdempotence(req, 'quete', moi);
      return app.db
        .transaction(() => {
          encaisser(moi, t);
          return quetes.reclamer(moi, req.params.id, t, cle);
        })
        .immediate();
    },
  );
};
