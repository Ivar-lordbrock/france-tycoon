import {
  achatReponseSchema,
  chantierReponseSchema,
  construireCorpsSchema,
  devisOpaSchema,
  ficheCommuneSchema,
  inseeParamsSchema,
  opaReponseSchema,
  venteReponseSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';
import { creerChantiers } from '../buildings/chantiers.ts';
import { creerEncaisseurSimple } from '../income/revenus.ts';
import { creerIssuesOpa } from '../takeovers/issues.ts';
import { creerLancementOpa } from '../takeovers/lancement.ts';
import { cleIdempotence } from '../wallet/idempotence.ts';
import { creerAchatVente } from './achat-vente.ts';
import { creerLecteurFiche } from './fiche.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Routes /territories : la fiche d'une commune (publique), l'achat, la vente, la construction et l'OPA (🔒💰). */
export const routesTerritoires: FastifyPluginAsyncZod = async (app) => {
  const lireFiche = creerLecteurFiche(app.db);
  const { acheter, vendre } = creerAchatVente(app.db, lireFiche);
  const { construire } = creerChantiers(app.db);
  const { devis, lancer } = creerLancementOpa(app.db);
  const { resoudreEchues } = creerIssuesOpa(app.db, creerEncaisseurSimple(app.db));

  app.get('/:insee', { schema: { params: inseeParamsSchema, response: { 200: ficheCommuneSchema } } }, (req, reply) => {
    const t = maintenant();
    resoudreEchues(t); // une OPA échue est résolue dès qu'on regarde la commune
    const fiche = lireFiche(req.params.insee, req.joueur?.id ?? null, t);
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

  app.post(
    '/:insee/buildings',
    { schema: { params: inseeParamsSchema, body: construireCorpsSchema, response: { 200: chantierReponseSchema } } },
    (req) => {
      const moi = exigerJoueur(req);
      return construire(
        moi,
        req.params.insee,
        req.body.typeCode,
        maintenant(),
        cleIdempotence(req, 'construction', moi),
      );
    },
  );

  app.get(
    '/:insee/takeover-quote',
    { schema: { params: inseeParamsSchema, response: { 200: devisOpaSchema } } },
    (req, reply) => {
      const moi = exigerJoueur(req);
      reply.header('cache-control', 'private, no-store');
      return devis(moi, req.params.insee, maintenant());
    },
  );

  app.post(
    '/:insee/takeovers',
    { schema: { params: inseeParamsSchema, response: { 200: opaReponseSchema } } },
    (req) => {
      const moi = exigerJoueur(req);
      return lancer(moi, req.params.insee, maintenant(), cleIdempotence(req, 'opa', moi));
    },
  );
};
