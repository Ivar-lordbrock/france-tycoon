import { type SanteReponse, santeReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { versionDuSchema } from '../../db/migrations.ts';

const VERSION = process.env.npm_package_version ?? '0.1.0';

interface LigneTache {
  name: string;
  status: 'running' | 'ok' | 'error';
  startedAt: number;
  finishedAt: number | null;
}

/** GET /admin/health : état du serveur, de la base et des tâches planifiées (sans 🛡️, sans donnée sensible). */
export const routesAdmin: FastifyPluginAsyncZod = async (app) => {
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
};
