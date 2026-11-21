import { etapeFaiteReponseSchema, etapeTutorielParamsSchema, tutorielReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { exigerJoueur } from '../auth/requete.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { creerTutoriel } from './tutoriel.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Routes 🔒 /tutorial : les 10 étapes, valider une étape de l'écran, passer (docs/04, docs/05 5.7). */
export const routesTutoriel: FastifyPluginAsyncZod = async (app) => {
  const tutoriel = creerTutoriel(app.db);
  const encaisser = creerEncaisseur(app.db);
  const reponse = { response: { 200: tutorielReponseSchema } };

  // Encaisse d'abord : le premier chantier fini valide l'étape « Construis ».

  app.get('/', { schema: reponse }, (req, reply) => {
    const moi = exigerJoueur(req);
    const t = maintenant();
    reply.header('cache-control', 'private, no-store');
    return app.db
      .transaction(() => {
        encaisser(moi, t);
        return tutoriel.lire(moi);
      })
      .immediate();
  });

  app.post('/skip', { schema: reponse }, (req) => {
    const moi = exigerJoueur(req);
    return app.db.transaction(() => tutoriel.passer(moi)).immediate();
  });

  app.post(
    '/:stepKey/complete',
    { schema: { params: etapeTutorielParamsSchema, response: { 200: etapeFaiteReponseSchema } } },
    (req) => {
      const moi = exigerJoueur(req);
      const t = maintenant();
      return app.db
        .transaction(() => {
          encaisser(moi, t);
          return tutoriel.completer(moi, req.params.stepKey, t);
        })
        .immediate();
    },
  );
};
