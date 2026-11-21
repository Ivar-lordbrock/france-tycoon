import {
  classementQuerySchema,
  classementReponseSchema,
  joueurParamsSchema,
  profilPublicSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { creerClassement } from './classement.ts';

// Routes publiques (connexion facultative) du classement et des profils (docs/04, « Quêtes, tutoriel, classement »).
// Simple lecture du cache de la tâche `leaderboard` : rien n'est écrit. « Classement vu » (quête, tutoriel)
// passe par POST /events/track, pour qu'un simple chargement de page ne compte pas.

/** GET /leaderboard : 50 joueurs par page, et ma ligne si je suis connecté. */
export const routesClassement: FastifyPluginAsyncZod = async (app) => {
  const classement = creerClassement(app.db);

  app.get(
    '/',
    { schema: { querystring: classementQuerySchema, response: { 200: classementReponseSchema } } },
    (req, reply) => {
      reply.header('cache-control', 'private, no-store');
      return app.db.transaction(() => classement.lire(req.query, req.joueur?.id ?? null))();
    },
  );
};

/** GET /players/:pseudo : profil public d'un joueur. */
export const routesJoueurs: FastifyPluginAsyncZod = async (app) => {
  const classement = creerClassement(app.db);

  app.get(
    '/:pseudo',
    { schema: { params: joueurParamsSchema, response: { 200: profilPublicSchema } } },
    (req, reply) => {
      reply.header('cache-control', 'private, no-store');
      return app.db.transaction(() => classement.profil(req.params.pseudo))();
    },
  );
};
