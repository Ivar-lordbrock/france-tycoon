import { z } from 'zod';

// GET /api/v1/admin/health — supervision, sans donnée sensible.

export const santeReponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
  now: z.number().int(),
  database: z.object({
    ok: z.boolean(),
    schemaVersion: z.string().nullable(),
    territories: z.number().int().nonnegative().nullable(),
  }),
  jobs: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['running', 'ok', 'error']),
      startedAt: z.number().int(),
      finishedAt: z.number().int().nullable(),
    }),
  ),
});

export type SanteReponse = z.infer<typeof santeReponseSchema>;

// Dashboard /admin (🛡️ équipe : modérateur ou admin, vérifié par le serveur).

export const gradeSchema = z.enum(['moderator', 'admin']);
export type Grade = z.infer<typeof gradeSchema>;

// GET /admin/me
export const adminMoiReponseSchema = z.object({ pseudo: z.string(), grade: gradeSchema });
export type AdminMoiReponse = z.infer<typeof adminMoiReponseSchema>;

// GET /admin/overview
const nombre = z.number().int().nonnegative();
const communes = z.object({ total: nombre, owned: nombre });

export const vueEnsembleReponseSchema = z.object({
  now: z.number().int(),
  players: z.object({ total: nombre, active24h: nombre, active7d: nombre, active14d: nombre }),
  territories: z.object({ metropole: communes, outreMer: communes }),
  /** Soldes des joueurs (₮ et gemmes) et revenu passif total par heure. */
  economy: z.object({ cash: nombre, gems: nombre, incomePerHour: nombre }),
  takeovers: z.object({ active: nombre, finished: nombre }),
  system: z.object({
    jobs: santeReponseSchema.shape.jobs,
    databaseBytes: nombre,
    /** `null` si le système ne le dit pas. */
    diskFreeBytes: nombre.nullable(),
  }),
});
export type VueEnsembleReponse = z.infer<typeof vueEnsembleReponseSchema>;
