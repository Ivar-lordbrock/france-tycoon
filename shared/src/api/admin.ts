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

// Vue Joueurs (étape 2). Rôle « player » = pas de grade.

export const roleSchema = z.enum(['player', 'moderator', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const idAdminParamsSchema = z.object({ id: z.coerce.number().int().positive() });

// GET /admin/players?q&role&status
export const rechercheJoueursQuerySchema = z.object({
  /** Pseudo ou e-mail (morceau), id Google ou numéro du joueur (exact). Vide = les 50 derniers actifs. */
  q: z.string().trim().max(100).default(''),
  role: roleSchema.optional(),
  status: z.enum(['active', 'dormant', 'banned', 'suspended']).optional(),
});

const ligneJoueurSchema = z.object({
  id: z.number().int(),
  pseudo: z.string(),
  email: z.string(),
  role: roleSchema,
  /** Admin par ADMIN_EMAILS : son grade ne se change pas depuis l'écran. */
  roleFixe: z.boolean(),
  status: z.enum(['active', 'dormant', 'banned', 'deleted']),
  /** Fin de la suspension en cours, sinon `null`. */
  suspendedUntil: z.number().int().nullable(),
  cash: nombre,
  gems: nombre,
  territories: nombre,
  lastActiveAt: z.number().int(),
  createdAt: z.number().int(),
});
export type LigneJoueur = z.infer<typeof ligneJoueurSchema>;

export const listeJoueursReponseSchema = z.object({ players: z.array(ligneJoueurSchema) });
export type ListeJoueursReponse = z.infer<typeof listeJoueursReponseSchema>;

const valeursAudit = z.record(z.string(), z.unknown()).nullable();
export const ligneAuditSchema = z.object({
  id: z.number().int(),
  actor: z.string(),
  actorRole: gradeSchema,
  action: z.string(),
  before: valeursAudit,
  after: valeursAudit,
  reason: z.string().nullable(),
  createdAt: z.number().int(),
});
export type LigneAudit = z.infer<typeof ligneAuditSchema>;

// GET /admin/players/:id
export const ficheJoueurReponseSchema = z.object({
  player: ligneJoueurSchema.extend({
    googleId: z.string(),
    suspensionReason: z.string().nullable(),
    incomePerHour: nombre,
    netWorth: z.number().int(),
  }),
  communes: z.array(
    z.object({
      id: z.number().int(),
      insee: z.string(),
      name: z.string(),
      isCapital: z.boolean(),
      acquiredAt: z.number().int().nullable(),
      buildings: nombre,
    }),
  ),
  transactions: z.array(
    z.object({
      id: z.number().int(),
      currency: z.enum(['cash', 'gems']),
      amount: z.number().int(),
      balanceAfter: nombre,
      reason: z.string(),
      createdAt: z.number().int(),
    }),
  ),
  takeovers: z.array(
    z.object({
      id: z.number().int(),
      territory: z.string(),
      side: z.enum(['attacker', 'defender']),
      other: z.string(),
      offerAmount: nombre,
      status: z.string(),
      createdAt: z.number().int(),
    }),
  ),
  /** Empreintes brouillées (sha256 + sel), jamais l'IP en clair. */
  logins: z.array(z.object({ ipHash: z.string(), uaHash: z.string(), createdAt: z.number().int() })),
  notes: z.array(
    z.object({
      id: z.number().int(),
      body: z.string(),
      author: z.string().nullable(),
      createdAt: z.number().int(),
      updatedAt: z.number().int(),
    }),
  ),
  audit: z.array(ligneAuditSchema),
});
export type FicheJoueurReponse = z.infer<typeof ficheJoueurReponseSchema>;

// Actions : motif obligatoire, écrit dans le journal d'audit.
const motif = z.string().trim().min(3, 'Motif trop court (3 caractères au moins)').max(500);

export const noteCorpsSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const motifCorpsSchema = z.object({ reason: motif });
export const suspendreCorpsSchema = z.object({ hours: z.number().int().min(1).max(720), reason: motif });
export const roleCorpsSchema = z.object({ role: roleSchema, reason: motif });
export const ajusterCorpsSchema = z.object({
  currency: z.enum(['cash', 'gems']),
  amount: z
    .number()
    .int()
    .min(-1_000_000_000_000)
    .max(1_000_000_000_000)
    .refine((n) => n !== 0, 'Montant nul'),
  reason: motif,
});
