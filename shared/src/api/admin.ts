import { z } from 'zod';
import { EVENEMENT_DUREE_MAX_H, REGLAGE_PCT_MAX, REGLAGE_PCT_MIN, SAISONS } from '../balance.ts';
import { STATUTS_OPA } from './opa.ts';
import { reglagesSchema, STATUTS_SIGNALEMENT } from './site.ts';

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
  /** Alertes anti-triche pas encore classées. */
  alerts: z.object({ open: nombre }),
  /** Saison de la semaine (docs/05, 5.12) ; `effectsActive` faux : elle ne change aucun revenu (bêta). */
  season: z.object({
    code: z.enum(SAISONS),
    name: z.string(),
    /** Prochain lundi minuit à Paris : la saison suivante commence. */
    endsAt: z.number().int(),
    effectsActive: z.boolean(),
    /** Communes qui ont un profil saisonnier (`territories.season_profile`). */
    profiles: z.object({ littoral: nombre, montagne: nombre, rural: nombre }),
  }),
  /** 14 derniers jours (UTC), du plus ancien à aujourd'hui : inscriptions et joueurs avec un mouvement d'argent. */
  daily: z.array(z.object({ day: z.string(), signups: nombre, active: nombre })),
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

// Sauvegardes (étape 5) : copies de la base sur le serveur, les 20 plus récentes. Ni restauration ni téléchargement par le web.
export const SAUVEGARDES_GARDEES = 20;
const ligneSauvegardeSchema = z.object({ name: z.string(), bytes: nombre, createdAt: z.number().int() });
export type LigneSauvegarde = z.infer<typeof ligneSauvegardeSchema>;

// GET /admin/backups — `directory: null` : pas de sauvegarde possible (base en mémoire).
export const listeSauvegardesReponseSchema = z.object({
  backups: z.array(ligneSauvegardeSchema),
  directory: z.string().nullable(),
});
export type ListeSauvegardesReponse = z.infer<typeof listeSauvegardesReponseSchema>;

// POST /admin/backups — `deleted` : anciennes copies effacées pour n'en garder que 20.
export const sauvegardeReponseSchema = z.object({ backup: ligneSauvegardeSchema, deleted: nombre });
export type SauvegardeReponse = z.infer<typeof sauvegardeReponseSchema>;

// Réglages à chaud et événements (étape 6) : admins pour changer, toute l'équipe pour lire. 100 % = normal.
const pct = z.number().int().min(REGLAGE_PCT_MIN).max(REGLAGE_PCT_MAX);

// PUT /admin/live-config — nouveaux réglages permanents, dès maintenant.
export const reglagesCorpsSchema = z.object({ price: pct, income: pct, building: pct, reason: motif });
export type ReglagesCorps = z.infer<typeof reglagesCorpsSchema>;

// POST /admin/events — `startsAt` absent ou passé : tout de suite. Fin automatique après `hours` heures.
export const evenementCorpsSchema = z.object({
  title: z.string().trim().min(3, 'Titre trop court (3 caractères au moins)').max(80),
  price: pct,
  income: pct,
  building: pct,
  startsAt: z.number().int().positive().optional(),
  hours: z.number().int().min(1).max(EVENEMENT_DUREE_MAX_H),
});
export type EvenementCorps = z.infer<typeof evenementCorpsSchema>;

export const STATUTS_EVENEMENT = ['upcoming', 'active', 'ended', 'cancelled'] as const;
const parQui = z.string().nullable();
const ligneVersionSchema = reglagesSchema.extend({
  id: z.number().int(),
  reason: z.string(),
  startsAt: z.number().int(),
  by: parQui,
});
const ligneEvenementSchema = reglagesSchema.extend({
  id: z.number().int(),
  title: z.string(),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  cancelledAt: z.number().int().nullable(),
  status: z.enum(STATUTS_EVENEMENT),
  by: parQui,
});
export type LigneEvenement = z.infer<typeof ligneEvenementSchema>;

// GET /admin/live-config — base permanente, réglages du moment, 20 derniers changements, 30 derniers événements.
export const reglagesAdminReponseSchema = z.object({
  base: reglagesSchema,
  effective: reglagesSchema,
  versions: z.array(ligneVersionSchema),
  events: z.array(ligneEvenementSchema),
});
export type ReglagesAdminReponse = z.infer<typeof reglagesAdminReponseSchema>;

// Anti-triche et journaux (étape 7). Les alertes sont recalculées à chaque lecture (docs/04).

/** IP hachée commune à plusieurs comptes, sur ce nombre de jours de connexions. */
export const TRICHE_IP_JOURS = 30;
/** Argent apparu hors du registre (`wallet_transactions`), sur ce nombre de jours. */
export const TRICHE_SOLDE_JOURS = 7;
/** Au moins TRICHE_OPA_MIN OPA entre les deux mêmes joueurs (dans un sens ou l'autre) en TRICHE_OPA_JOURS jours. */
export const TRICHE_OPA_JOURS = 7;
export const TRICHE_OPA_MIN = 3;

export const REGLES_TRICHE = ['shared_ip', 'balance_jump', 'repeat_takeovers'] as const;
export type RegleTriche = (typeof REGLES_TRICHE)[number];
const joueurCourtSchema = z.object({ id: z.number().int(), pseudo: z.string() });
const deviseSchema = z.enum(['cash', 'gems']);

export const ligneAlerteSchema = z.object({
  /** Règle + faits : un fait nouveau donne une clé nouvelle, et l'alerte revient même classée. */
  key: z.string(),
  rule: z.enum(REGLES_TRICHE),
  players: z.array(joueurCourtSchema),
  /** IP partagée : nombre de comptes ; solde : montant apparu ; OPA : nombre d'OPA. */
  count: z.number().int(),
  currency: deviseSchema.nullable(),
  /** Dernier fait vu. */
  at: z.number().int(),
  review: z.object({ by: z.string().nullable(), note: z.string(), at: z.number().int() }).nullable(),
});
export type LigneAlerte = z.infer<typeof ligneAlerteSchema>;

// GET /admin/cheat-alerts — non classées d'abord, puis les plus récentes.
export const alertesReponseSchema = z.object({ alerts: z.array(ligneAlerteSchema) });
export type AlertesReponse = z.infer<typeof alertesReponseSchema>;

// POST /admin/cheat-alerts/review — toute l'équipe ; la note va dans l'audit.
export const classerAlerteCorpsSchema = z.object({
  key: z.string().min(3).max(200),
  note: z.string().trim().min(3).max(500),
});
export type ClasserAlerteCorps = z.infer<typeof classerAlerteCorpsSchema>;

// GET /admin/logs/{activity,audit,errors}?q — les 100 plus récents.
export const journalQuerySchema = z.object({ q: z.string().trim().max(100).default('') });

const ligneActiviteSchema = z.object({
  id: z.number().int(),
  player: joueurCourtSchema,
  currency: deviseSchema,
  amount: z.number().int(),
  balanceAfter: z.number().int(),
  reason: z.string(),
  createdAt: z.number().int(),
});
export const journalActiviteReponseSchema = z.object({ rows: z.array(ligneActiviteSchema) });
export type JournalActiviteReponse = z.infer<typeof journalActiviteReponseSchema>;

export const journalAuditReponseSchema = z.object({
  rows: z.array(ligneAuditSchema.extend({ targetType: z.string(), targetId: z.string() })),
});
export type JournalAuditReponse = z.infer<typeof journalAuditReponseSchema>;

const ligneErreurSchema = z.object({
  /** `api` : erreur 500 d'une route ; `job` : tâche planifiée en erreur. */
  source: z.enum(['api', 'job']),
  place: z.string(),
  message: z.string(),
  at: z.number().int(),
});
export const journalErreursReponseSchema = z.object({ rows: z.array(ligneErreurSchema) });
export type JournalErreursReponse = z.infer<typeof journalErreursReponseSchema>;

// GET /admin/export/:quoi — fichier CSV, admins seulement (e-mails des joueurs dedans).
export const EXPORTS_CSV = ['players', 'audit', 'activity'] as const;
export const exportParamsSchema = z.object({ quoi: z.enum(EXPORTS_CSV) });
