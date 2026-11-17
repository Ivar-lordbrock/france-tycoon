import { achatReponseSchema, ficheCommuneSchema, inseeParamsSchema, venteReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';
import { cleIdempotence } from '../wallet/idempotence.ts';
import { creerAchatVente } from './achat-vente.ts';
import { creerLecteurFiche } from './fiche.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Routes /territories : la fiche d'une commune (publique), l'achat et la vente (🔒💰). */
export const routesTerritoires: FastifyPluginAsyncZod = async (app) => {
  const lireFiche = creerLecteurFiche(app.db);
  const { acheter, vendre } = creerAchatVente(app.db, lireFiche);

  app.get('/:insee', { schema: { params: inseeParamsSchema, response: { 200: ficheCommuneSchema } } }, (req, reply) => {
    const fiche = lireFiche(req.params.insee, req.joueur?.id ?? null, maintenant());
    if (!fiche) {
      throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune française avec le code ${req.params.insee}.`);
    }
    reply.header('cache-control', 'private, no-cache');
    return fiche;
  });

  app.post('/:insee/buy', { schema: { params: inseeParamsSchema, response: { 200: achatReponseSchema } } }, (req) => {
    const moi = exigerJoueur(req);
    return acheter(moi, req.params.insee, maintenant(), cleIdempotence(req, 'achat', moi));
  });

  app.post('/:insee/sell', { schema: { params: inseeParamsSchema, response: { 200: venteReponseSchema } } }, (req) => {
    const moi = exigerJoueur(req);
    return vendre(moi, req.params.insee, maintenant(), cleIdempotence(req, 'vente', moi));
  });
};
