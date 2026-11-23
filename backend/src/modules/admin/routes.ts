import { statfsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type AdminMoiReponse,
  adminMoiReponseSchema,
  type Grade,
  type SanteReponse,
  santeReponseSchema,
  type VueEnsembleReponse,
  vueEnsembleReponseSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { versionDuSchema } from '../../db/migrations.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';
import { creerLecteurRevenus, revenuDuJoueur } from '../income/revenus.ts';
import { routesAdminJoueurs } from './joueurs.ts';
import { routesAdminLive } from './live.ts';
import { routesAdminSauvegardes } from './sauvegardes.ts';
import { routesAdminTerritoires } from './territoires.ts';

const VERSION = process.env.npm_package_version ?? '0.1.0';
const JOUR_S = 86_400;

interface LigneTache {
  name: string;
  status: 'running' | 'ok' | 'error';
  startedAt: number;
  finishedAt: number | null;
}

export interface OptionsAdmin {
  /** E-mails admin d'office (`ADMIN_EMAILS`), en minuscules. */
  adminEmails?: readonly string[];
  dossierSauvegardes?: string;
}

/**
 * GET /admin/health : état du serveur, de la base et des tâches planifiées (public, sans donnée sensible).
 * Le reste (/admin/me, /admin/overview…) : 🛡️ équipe seulement.
 */
export const routesAdmin: FastifyPluginAsyncZod<OptionsAdmin> = async (
  app,
  { adminEmails = [], dossierSauvegardes },
) => {
  const derniereExecution = app.db.prepare<[], LigneTache>(`
    SELECT job_name AS name, status, started_at AS startedAt, finished_at AS finishedAt
    FROM job_runs AS j
    WHERE started_at = (SELECT max(started_at) FROM job_runs WHERE job_name = j.job_name)
    GROUP BY job_name
    ORDER BY job_name`);
  const compterTerritoires = app.db.prepare<[], number>('SELECT count(*) FROM territories').pluck();

  app.get('/health', { schema: { response: { 200: santeReponseSchema, 503: santeReponseSchema } } }, (_req, reply) => {
    const sante: SanteReponse = {
      status: 'ok',
      version: VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      now: Math.floor(Date.now() / 1000),
      database: { ok: true, schemaVersion: null, territories: null },
      jobs: [],
    };
    try {
      sante.database.schemaVersion = versionDuSchema(app.db);
      sante.database.territories = compterTerritoires.get() ?? 0;
      sante.jobs = derniereExecution.all();
    } catch (erreur) {
      app.log.error({ err: erreur }, 'base injoignable');
      sante.status = 'degraded';
      sante.database.ok = false;
      reply.code(503);
    }
    return sante;
  });

  // Un compte banni ou supprimé n'arrive pas ici : sa session est déjà refusée (401).
  const lireCompte = app.db.prepare<[number], { pseudo: string; email: string; role: Grade | null }>(`
    SELECT u.pseudo, u.email, s.role
    FROM users AS u LEFT JOIN staff_roles AS s ON s.user_id = u.id
    WHERE u.id = ?`);

  // Routes 🛡️ : le serveur décide du grade à chaque requête, l'écran ne fait que suivre.
  app.register(async (equipe) => {
    equipe.decorateRequest('equipe', null);
    equipe.addHook('preHandler', async (req) => {
      const id = exigerJoueur(req);
      const compte = lireCompte.get(id);
      const fixe = !!compte && adminEmails.includes(compte.email.toLowerCase());
      const grade = compte && (fixe ? 'admin' : compte.role);
      if (!compte || !grade) {
        throw new ErreurMetier('FORBIDDEN', 403, 'Réservé à l’équipe Kadastr (modérateurs et admins).');
      }
      req.equipe = { id, pseudo: compte.pseudo, grade, fixe };
    });

    // Le crochet ci-dessus a rempli `req.equipe` ou refusé la requête.
    equipe.get('/me', { schema: { response: { 200: adminMoiReponseSchema } } }, (req) => {
      const { pseudo, grade } = req.equipe as AdminMoiReponse;
      return { pseudo, grade };
    });

    equipe.register(routesAdminJoueurs, { adminEmails });
    equipe.register(routesAdminTerritoires);
    equipe.register(routesAdminLive);
    equipe.register(routesAdminSauvegardes, { dossier: dossierSauvegardes });

    const joueurs = app.db.prepare<[number, number, number], VueEnsembleReponse['players']>(`
      SELECT count(*) AS total,
        coalesce(sum(last_active_at >= ?), 0) AS active24h,
        coalesce(sum(last_active_at >= ?), 0) AS active7d,
        coalesce(sum(last_active_at >= ?), 0) AS active14d
      FROM users WHERE status <> 'deleted'`);
    const communes = app.db.prepare<[], { zone: 'metropole' | 'outre_mer'; total: number; owned: number }>(`
      SELECT region_type AS zone, count(*) AS total, count(owner_id) AS owned FROM territories GROUP BY region_type`);
    const soldes = app.db.prepare<[], { cash: number; gems: number }>(`
      SELECT coalesce(sum(cash), 0) AS cash, coalesce(sum(premium_currency), 0) AS gems
      FROM users WHERE status <> 'deleted'`);
    const proprietaires = app.db
      .prepare<[], number>('SELECT DISTINCT owner_id FROM territories WHERE owner_id IS NOT NULL')
      .pluck();
    const lireRevenus = creerLecteurRevenus(app.db);
    const opa = app.db.prepare<[], VueEnsembleReponse['takeovers']>(`
      SELECT coalesce(sum(status = 'pending'), 0) AS active, coalesce(sum(status <> 'pending'), 0) AS finished
      FROM takeovers`);
    const signalementsOuverts = app.db
      .prepare<[], number>("SELECT count(*) FROM player_reports WHERE status = 'open'")
      .pluck();
    const tailleBase = app.db
      .prepare<[], number>('SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()')
      .pluck();

    equipe.get('/overview', { schema: { response: { 200: vueEnsembleReponseSchema } } }, () => {
      const now = Math.floor(Date.now() / 1000);
      const parZone = new Map(communes.all().map((c) => [c.zone, { total: c.total, owned: c.owned }]));
      // shortcut: un calcul par propriétaire à chaque appel ; mettre en cache si des milliers de joueurs ralentissent la page.
      let incomePerHour = 0;
      for (const id of proprietaires.all()) incomePerHour += revenuDuJoueur([...lireRevenus(id).values()], now);
      let diskFreeBytes: number | null = null;
      try {
        const disque = statfsSync(dirname(app.db.name));
        diskFreeBytes = disque.bavail * disque.bsize;
      } catch {
        // Base en mémoire ou système muet : la place libre reste inconnue.
      }
      return {
        now,
        players: joueurs.get(now - JOUR_S, now - 7 * JOUR_S, now - 14 * JOUR_S) ?? {
          total: 0,
          active24h: 0,
          active7d: 0,
          active14d: 0,
        },
        territories: {
          metropole: parZone.get('metropole') ?? { total: 0, owned: 0 },
          outreMer: parZone.get('outre_mer') ?? { total: 0, owned: 0 },
        },
        economy: { ...(soldes.get() ?? { cash: 0, gems: 0 }), incomePerHour },
        takeovers: opa.get() ?? { active: 0, finished: 0 },
        reports: { open: signalementsOuverts.get() ?? 0 },
        system: { jobs: derniereExecution.all(), databaseBytes: tailleBase.get() ?? 0, diskFreeBytes },
      };
    });
  });
};

declare module 'fastify' {
  interface FastifyRequest {
    /** Membre de l'équipe connecté (routes 🛡️ /admin seulement), sinon `null`. */
    equipe: { id: number; pseudo: string; grade: Grade; fixe: boolean } | null;
  }
}
