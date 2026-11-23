import {
  idAdminParamsSchema,
  inseeParamsSchema,
  type LigneCommuneAdmin,
  type LigneOpaAdmin,
  listeCommunesAdminReponseSchema,
  listeOpaAdminReponseSchema,
  motifCorpsSchema,
  prixForceCorpsSchema,
  rechercheCommunesQuerySchema,
  rechercheOpaQuerySchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { creerEncaisseurSimple } from '../income/revenus.ts';
import { creerRequetesCarte } from '../map/requetes.ts';
import { creerIssuesOpa } from '../takeovers/issues.ts';
import { creerAudit, exigerAdmin } from './audit.ts';

// Vue Territoires et OPA du dashboard (étape 3). Lecture : toute l'équipe. Actions : admins seulement.

const maintenant = () => Math.floor(Date.now() / 1000);

type LigneCommuneBrute = Omit<LigneCommuneAdmin, 'owner' | 'isCapital' | 'takeoverPending'> & {
  id: number;
  ownerId: number | null;
  ownerPseudo: string | null;
  isCapital: number;
  takeoverPending: number;
};

export const routesAdminTerritoires: FastifyPluginAsyncZod = async (app) => {
  const db = app.db;
  const auditer = creerAudit(db);
  const { rechercher: rechercherNom } = creerRequetesCarte(db);
  const issues = creerIssuesOpa(db, creerEncaisseurSimple(db));

  const communes = db.prepare<Record<string, unknown>, LigneCommuneBrute>(`
    SELECT * FROM (
      SELECT t.id, t.insee_code AS insee, t.name, t.department_code AS department, t.population,
        t.base_value AS baseValue, t.forced_price AS forcedPrice, t.is_capital AS isCapital,
        t.owner_id AS ownerId, u.pseudo AS ownerPseudo,
        EXISTS (SELECT 1 FROM takeovers WHERE territory_id = t.id AND status = 'pending') AS takeoverPending,
        CASE WHEN t.forced_price IS NOT NULL THEN (
          SELECT reason FROM admin_audit
          WHERE action = 'territory.price' AND target_type = 'territory' AND target_id = t.insee_code
          ORDER BY id DESC LIMIT 1
        ) END AS forcedReason
      FROM territories AS t LEFT JOIN users AS u ON u.id = t.owner_id
      WHERE @insees IS NULL OR t.insee_code IN (SELECT value FROM json_each(@insees))
    )
    WHERE @filtre IS NULL
      OR (@filtre = 'owned' AND ownerId IS NOT NULL)
      OR (@filtre = 'free' AND ownerId IS NULL)
      OR (@filtre = 'forced' AND forcedPrice IS NOT NULL)
      OR (@filtre = 'takeover' AND takeoverPending)
    ORDER BY population DESC
    LIMIT 50`);

  app.get(
    '/territories',
    { schema: { querystring: rechercheCommunesQuerySchema, response: { 200: listeCommunesAdminReponseSchema } } },
    (req) => {
      const { q, filter } = req.query;
      // La recherche de la carte (accents, abréviations, code INSEE) choisit les communes.
      const insees = q === '' ? null : JSON.stringify(rechercherNom(q).map((r) => r.insee));
      const lignes = communes.all({ insees, filtre: filter ?? null });
      return {
        territories: lignes.map(({ id: _, ownerId, ownerPseudo, isCapital, takeoverPending, ...c }) => ({
          ...c,
          owner: ownerId === null ? null : { id: ownerId, pseudo: ownerPseudo ?? '' },
          isCapital: isCapital === 1,
          takeoverPending: takeoverPending === 1,
        })),
      };
    },
  );

  const commune = db.prepare<[string], { id: number; baseValue: number; forcedPrice: number | null }>(
    'SELECT id, base_value AS baseValue, forced_price AS forcedPrice FROM territories WHERE insee_code = ?',
  );
  const forcerPrix = db.prepare<[number | null, number]>('UPDATE territories SET forced_price = ? WHERE id = ?');

  app.put(
    '/territories/:insee/price',
    { schema: { params: inseeParamsSchema, body: prixForceCorpsSchema } },
    (req, reply) => {
      const acteur = exigerAdmin(req);
      const insee = req.params.insee.toUpperCase();
      const { price, reason } = req.body;
      db.transaction(() => {
        const c = commune.get(insee);
        if (!c) throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune avec le code ${insee}.`);
        forcerPrix.run(price, c.id);
        auditer(acteur, {
          action: 'territory.price',
          cible: { type: 'territory', id: insee },
          avant: { forcedPrice: c.forcedPrice, baseValue: c.baseValue },
          apres: { forcedPrice: price },
          motif: reason,
        });
      }).immediate();
      return reply.code(204).send();
    },
  );

  const opas = db.prepare<[string], LigneOpaAdmin>(`
    SELECT o.id, t.insee_code AS insee, t.name AS territory, a.pseudo AS attacker, d.pseudo AS defender,
      o.offer_amount AS offerAmount, o.defense_cost AS defenseCost, o.status, o.created_at AS createdAt,
      o.expires_at AS expiresAt, o.resolved_at AS resolvedAt
    FROM takeovers AS o
      JOIN territories AS t ON t.id = o.territory_id
      JOIN users AS a ON a.id = o.attacker_id
      JOIN users AS d ON d.id = o.defender_id
    WHERE o.status = ?
    ORDER BY o.created_at DESC
    LIMIT 50`);

  app.get(
    '/takeovers',
    { schema: { querystring: rechercheOpaQuerySchema, response: { 200: listeOpaAdminReponseSchema } } },
    (req) => {
      issues.resoudreEchues(maintenant()); // une OPA échue n'est plus « en cours »
      return { takeovers: opas.all(req.query.status) };
    },
  );

  /** L'OPA `id`, encore en cours (les OPA échues sont d'abord résolues). Dans la transaction de l'action. */
  function opaEnCours(id: number, instant: number) {
    issues.resoudreEchues(instant);
    const o = issues.lire(id);
    if (!o) throw new ErreurMetier('NOT_FOUND', 404, 'OPA introuvable.');
    if (o.status !== 'pending') {
      throw new ErreurMetier('TAKEOVER_NOT_PENDING', 409, 'Cette OPA est déjà terminée.');
    }
    return o;
  }

  // Forcer : la commune passe tout de suite à l'attaquant, comme au bout des 24 h.
  app.post(
    '/takeovers/:id/force',
    { schema: { params: idAdminParamsSchema, body: motifCorpsSchema } },
    (req, reply) => {
      const acteur = exigerAdmin(req);
      db.transaction(() => {
        const t = maintenant();
        const o = opaEnCours(req.params.id, t);
        issues.transferer(o, 'succeeded', t);
        auditer(acteur, {
          action: 'takeover.force',
          cible: { type: 'takeover', id: o.id },
          avant: { status: 'pending', insee: o.territoryInsee, owner: o.defenderId },
          apres: { status: 'succeeded', owner: o.attackerId, payout: o.offerAmount },
          motif: req.body.reason,
        });
      }).immediate();
      return reply.code(204).send();
    },
  );

  // Annuler : l'attaquant récupère toute son offre, la commune reste au défenseur.
  app.post(
    '/takeovers/:id/cancel',
    { schema: { params: idAdminParamsSchema, body: motifCorpsSchema } },
    (req, reply) => {
      const acteur = exigerAdmin(req);
      db.transaction(() => {
        const t = maintenant();
        const o = opaEnCours(req.params.id, t);
        issues.annuler(o, t);
        auditer(acteur, {
          action: 'takeover.cancel',
          cible: { type: 'takeover', id: o.id },
          avant: { status: 'pending', insee: o.territoryInsee },
          apres: { status: 'voided', refund: o.offerAmount },
          motif: req.body.reason,
        });
      }).immediate();
      return reply.code(204).send();
    },
  );
};
