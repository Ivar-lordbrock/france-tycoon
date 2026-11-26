import { appelAProjetsReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { exigerJoueur } from '../auth/requete.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { creerAppelsAProjets } from './projets.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Route 🔒 GET /me/state-project : l'appel à projets de la semaine (docs/04, docs/05 5.11). */
export const routesAppelsAProjets: FastifyPluginAsyncZod = async (app) => {
  const projets = creerAppelsAProjets(app.db);
  const encaisser = creerEncaisseur(app.db);

  app.get('/', { schema: { response: { 200: appelAProjetsReponseSchema } } }, (req, reply) => {
    const moi = exigerJoueur(req);
    const t = maintenant();
    reply.header('cache-control', 'private, no-store');
    return app.db
      .transaction(() => {
        encaisser(moi, t); // un chantier fini pendant l'absence fait avancer le projet
        return projets.semaine(moi, t);
      })
      .immediate();
  });
};
