import {
  EVENEMENT_DEBUT_MAX_S,
  evenementCorpsSchema,
  idAdminParamsSchema,
  REGLAGES_NORMAUX,
  type Reglages,
  reglagesAdminReponseSchema,
  reglagesCorpsSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { creerLecteurReglages } from '../reglages/calendrier.ts';
import { acteurDe, creerAudit, exigerAdmin } from './audit.ts';

// Réglages à chaud et événements datés (étape 6) : l'équipe lit, les admins changent, tout va à l'audit.
// Rien ne s'écrit dans le passé : les revenus non encaissés se calculent par morceaux avec cet historique.

const maintenant = () => Math.floor(Date.now() / 1000);
const PCT = 'price_pct AS price, income_pct AS income, building_pct AS building';

export const routesAdminReglages: FastifyPluginAsyncZod = async (app) => {
  const db = app.db;
  const auditer = creerAudit(db);
  const reglagesA = creerLecteurReglages(db);
  const base = db.prepare<[number], Reglages>(
    `SELECT ${PCT} FROM live_config WHERE starts_at <= ? ORDER BY starts_at DESC, id DESC LIMIT 1`,
  );
  const versions = db.prepare<[], Reglages & { id: number; reason: string; startsAt: number; by: string | null }>(`
    SELECT c.id, ${PCT}, c.reason, c.starts_at AS startsAt, u.pseudo AS by
    FROM live_config AS c LEFT JOIN users AS u ON u.id = c.created_by
    ORDER BY c.starts_at DESC, c.id DESC LIMIT 20`);
  type LigneEv = Reglages & {
    id: number;
    title: string;
    startsAt: number;
    endsAt: number;
    cancelledAt: number | null;
    by: string | null;
  };
  const COLONNES_EV = `e.id, e.title, ${PCT}, e.starts_at AS startsAt, e.ends_at AS endsAt,
    e.cancelled_at AS cancelledAt, u.pseudo AS by`;
  const evenements = db.prepare<[], LigneEv>(`
    SELECT ${COLONNES_EV} FROM game_events AS e LEFT JOIN users AS u ON u.id = e.created_by
    ORDER BY e.starts_at DESC, e.id DESC LIMIT 30`);
  const evenement = db.prepare<[number], LigneEv>(
    `SELECT ${COLONNES_EV} FROM game_events AS e LEFT JOIN users AS u ON u.id = e.created_by WHERE e.id = ?`,
  );
  const statut = (e: LigneEv, t: number) => {
    if (e.cancelledAt !== null && e.cancelledAt < e.endsAt) return 'cancelled' as const;
    if (t < e.startsAt) return 'upcoming' as const;
    return t < e.endsAt ? ('active' as const) : ('ended' as const);
  };

  app.get('/live-config', { schema: { response: { 200: reglagesAdminReponseSchema } } }, (req) => {
    acteurDe(req);
    const t = maintenant();
    return {
      base: base.get(t) ?? REGLAGES_NORMAUX,
      effective: reglagesA(t),
      versions: versions.all(),
      events: evenements.all().map((e) => ({ ...e, status: statut(e, t) })),
    };
  });

  const insererVersion = db.prepare<[number, number, number, string, number, number]>(`
    INSERT INTO live_config (price_pct, income_pct, building_pct, reason, created_by, starts_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  app.put('/live-config', { schema: { body: reglagesCorpsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    const { price, income, building, reason } = req.body;
    const t = maintenant();
    db.transaction(() => {
      const avant = base.get(t) ?? REGLAGES_NORMAUX;
      insererVersion.run(price, income, building, reason, acteur.id, t);
      auditer(acteur, {
        action: 'config.update',
        cible: { type: 'config', id: 'live' },
        avant: { ...avant },
        apres: { price, income, building },
        motif: reason,
      });
    }).immediate();
    return reply.code(204).send();
  });

  const insererEvenement = db.prepare<[string, number, number, number, number, number, number]>(`
    INSERT INTO game_events (title, price_pct, income_pct, building_pct, starts_at, ends_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`);
  app.post('/events', { schema: { body: evenementCorpsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    const { title, price, income, building, startsAt, hours } = req.body;
    const t = maintenant();
    // Jamais dans le passé : un événement ne doit pas gonfler des revenus déjà accumulés.
    const debut = Math.max(t, startsAt ?? t);
    if (debut > t + EVENEMENT_DEBUT_MAX_S) {
      throw new ErreurMetier('VALIDATION_ERROR', 400, 'Un événement commence au plus tard dans 90 jours.');
    }
    const fin = debut + hours * 3_600;
    db.transaction(() => {
      const { id } = insererEvenement.get(title, price, income, building, debut, fin, acteur.id) as { id: number };
      auditer(acteur, {
        action: 'event.create',
        cible: { type: 'event', id },
        apres: { title, price, income, building, startsAt: debut, endsAt: fin },
      });
    }).immediate();
    return reply.code(204).send();
  });

  const annuler = db.prepare<[number, number]>('UPDATE game_events SET cancelled_at = ? WHERE id = ?');
  app.post('/events/:id/cancel', { schema: { params: idAdminParamsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    const t = maintenant();
    db.transaction(() => {
      const e = evenement.get(req.params.id);
      if (!e) throw new ErreurMetier('NOT_FOUND', 404, 'Événement introuvable.');
      const s = statut(e, t);
      if (s === 'ended' || s === 'cancelled') {
        throw new ErreurMetier('VALIDATION_ERROR', 409, 'Cet événement est déjà fini ou annulé.');
      }
      annuler.run(t, e.id);
      auditer(acteur, {
        action: 'event.cancel',
        cible: { type: 'event', id: e.id },
        avant: { title: e.title, startsAt: e.startsAt, endsAt: e.endsAt },
        apres: { cancelledAt: t },
      });
    }).immediate();
    return reply.code(204).send();
  });
};
