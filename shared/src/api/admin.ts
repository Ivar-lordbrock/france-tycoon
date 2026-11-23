import { z } from 'zod';
import { STATUTS_OPA } from './opa.ts';
import { STATUTS_SIGNALEMENT } from './site.ts';

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
  /** Signalements de bugs pas encore traités (`open`). */
  reports: z.object({ open: nombre }),
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

// Vue Territoires et OPA (étape 3).

// GET /admin/territories?q&filter
export const rechercheCommunesQuerySchema = z.object({
  /** Nom (sans souci d'accents) ou code INSEE. Vide = les 50 plus peuplées du filtre. */
  q: z.string().trim().max(100).default(''),
  filter: z.enum(['owned', 'free', 'forced', 'takeover']).optional(),
});

const ligneCommuneAdminSchema = z.object({
  insee: z.string(),
  name: z.string(),
  department: z.string(),
  population: nombre,
  /** Prix calculé (V0). */
  baseValue: nombre,
  /** Prix d'achat forcé par un admin, sinon `null` : on paie alors `baseValue`. */
  forcedPrice: nombre.nullable(),
  forcedReason: z.string().nullable(),
  owner: z.object({ id: z.number().int(), pseudo: z.string() }).nullable(),
  isCapital: z.boolean(),
  takeoverPending: z.boolean(),
});
export type LigneCommuneAdmin = z.infer<typeof ligneCommuneAdminSchema>;

export const listeCommunesAdminReponseSchema = z.object({ territories: z.array(ligneCommuneAdminSchema) });
export type ListeCommunesAdminReponse = z.infer<typeof listeCommunesAdminReponseSchema>;

// PUT /admin/territories/:insee/price — `price: null` = retour au calcul auto.
export const prixForceCorpsSchema = z.object({
  price: z.number().int().positive().max(1_000_000_000_000).nullable(),
  reason: motif,
});

// GET /admin/takeovers?status
export const rechercheOpaQuerySchema = z.object({ status: z.enum(STATUTS_OPA).default('pending') });

const ligneOpaAdminSchema = z.object({
  id: z.number().int(),
  insee: z.string(),
  territory: z.string(),
  attacker: z.string(),
  defender: z.string(),
  offerAmount: nombre,
  defenseCost: nombre,
  status: z.enum(STATUTS_OPA),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  resolvedAt: z.number().int().nullable(),
});
export type LigneOpaAdmin = z.infer<typeof ligneOpaAdminSchema>;

export const listeOpaAdminReponseSchema = z.object({ takeovers: z.array(ligneOpaAdminSchema) });
export type ListeOpaAdminReponse = z.infer<typeof listeOpaAdminReponseSchema>;

// Contrôle live et signalements (étape 4).

// PUT /admin/site/maintenance — `message: null` coupe la maintenance.
export const maintenanceCorpsSchema = z.object({ message: z.string().trim().min(3).max(300).nullable() });
// PUT /admin/site/banner — `text: null` retire la bannière ; `hours: null` = sans fin.
export const banniereCorpsSchema = z.object({
  text: z.string().trim().min(3).max(300).nullable(),
  hours: z.number().int().min(1).max(720).nullable(),
});

// POST /admin/gifts — sans `playerId` : tous les joueurs actifs (sauf soi). Le motif est montré aux joueurs.
export const cadeauCorpsSchema = z.object({
  playerId: z.number().int().positive().optional(),
  currency: z.enum(['cash', 'gems']),
  amount: z.number().int().min(1).max(1_000_000_000),
  reason: motif,
});
export const cadeauReponseSchema = z.object({ count: nombre });
export type CadeauCorps = z.infer<typeof cadeauCorpsSchema>;
export type CadeauReponse = z.infer<typeof cadeauReponseSchema>;

// GET /admin/reports?status
export const rechercheSignalementsQuerySchema = z.object({ status: z.enum(STATUTS_SIGNALEMENT).default('open') });

const ligneSignalementSchema = z.object({
  id: z.number().int(),
  player: z.object({ id: z.number().int(), pseudo: z.string() }).nullable(),
  body: z.string(),
  page: z.string().nullable(),
  status: z.enum(STATUTS_SIGNALEMENT),
  staffNote: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type LigneSignalement = z.infer<typeof ligneSignalementSchema>;

export const listeSignalementsReponseSchema = z.object({ reports: z.array(ligneSignalementSchema) });
export type ListeSignalementsReponse = z.infer<typeof listeSignalementsReponseSchema>;

// PATCH /admin/reports/:id — toute l'équipe. Réglé ou sans suite : le joueur reçoit un message.
export const majSignalementCorpsSchema = z.object({
  status: z.enum(STATUTS_SIGNALEMENT),
  note: z.string().trim().max(2000).nullable(),
});
