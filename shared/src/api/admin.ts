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
