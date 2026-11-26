import { z } from 'zod';
import { chantierFiniSchema, portefeuilleSchema } from './economie.ts';
import { ROLES_OPA, STATUTS_OPA_TERMINEE } from './opa.ts';

// Routes /api/v1/me/notifications et flux /events (docs/04-api.md, « Notifications et temps réel »).

const entier = z.number().int();

/** POST /me/notifications/read : marquer des messages comme lus, par numéro ou tous d'un coup. */
export const lireNotificationsCorpsSchema = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export type LireNotificationsCorps = z.infer<typeof lireNotificationsCorpsSchema>;

export const lireNotificationsReponseSchema = z.object({
  /** Messages encore non lus après l'appel. */
  unreadNotifications: z.number().int().nonnegative(),
});
export type LireNotificationsReponse = z.infer<typeof lireNotificationsReponseSchema>;

// Contenu d'un message, selon son type (`notifications.kind`, `payload` en JSON)

/** OPA reçue : le défenseur a 24 h pour réagir. */
export const contenuOpaRecueSchema = z.object({
  takeoverId: entier.positive(),
  territoryInsee: z.string(),
  territoryName: z.string(),
  attackerPseudo: z.string(),
  offerAmount: entier.positive(),
  defenseCost: entier.positive(),
  expiresAt: entier,
});
export type ContenuOpaRecue = z.infer<typeof contenuOpaRecueSchema>;

/** OPA terminée : envoyé à l'attaquant et au défenseur, chacun avec son rôle. */
export const contenuOpaTermineeSchema = z.object({
  takeoverId: entier.positive(),
  territoryInsee: z.string(),
  territoryName: z.string(),
  status: z.enum(STATUTS_OPA_TERMINEE),
  role: z.enum(ROLES_OPA),
  /** L'autre joueur de l'OPA. */
  otherPseudo: z.string(),
});
export type ContenuOpaTerminee = z.infer<typeof contenuOpaTermineeSchema>;

/** J+11 sans activité : les territoires seront libérés à `releaseAt`. */
export const contenuAvertissementInactiviteSchema = z.object({ releaseAt: entier });
export type ContenuAvertissementInactivite = z.infer<typeof contenuAvertissementInactiviteSchema>;

/** J+14 : l'État a racheté les territoires du joueur absent ; il garde son cash. */
export const contenuLiberationInactiviteSchema = z.object({
  territories: entier.positive(),
  /** Total versé (5.6 : 50 % de V0 + bâtiments, par territoire). */
  amount: entier.nonnegative(),
});
export type ContenuLiberationInactivite = z.infer<typeof contenuLiberationInactiviteSchema>;

/** Une quête du jour vient d'atteindre son objectif : la récompense attend d'être réclamée. */
export const contenuQueteTermineeSchema = z.object({
  /** `user_quests.id`, à passer à `POST /me/quests/:id/claim`. */
  questId: entier.positive(),
  code: z.string(),
  title: z.string(),
  rewardCash: entier.nonnegative(),
  rewardGems: entier.nonnegative(),
});
export type ContenuQueteTerminee = z.infer<typeof contenuQueteTermineeSchema>;

/** L'appel à projets de la semaine est réussi : la prime est déjà versée (docs/05, 5.11). */
export const contenuProjetReussiSchema = z.object({
  code: z.string(),
  title: z.string(),
  rewardCash: entier.nonnegative(),
  rewardGems: entier.nonnegative(),
});
export type ContenuProjetReussi = z.infer<typeof contenuProjetReussiSchema>;

/** Le patrimoine a franchi un seuil (5.4) : nouveau rang, qui ne redescendra plus. */
export const contenuNouveauRangSchema = z.object({
  /** 1 Notable … 4 Tycoon (`RANGS`). */
  rankLevel: entier.positive(),
  previousLevel: entier.nonnegative(),
  /** Limite de territoires après le passage (Baron et Magnat : +1). */
  maxTerritories: entier.positive(),
});
export type ContenuNouveauRang = z.infer<typeof contenuNouveauRangSchema>;

/** Cadeau de l'équipe Kadastr (dashboard /admin), avec son message. */
export const contenuCadeauSchema = z.object({
  currency: z.enum(['cash', 'gems']),
  amount: entier.positive(),
  message: z.string(),
});
export type ContenuCadeau = z.infer<typeof contenuCadeauSchema>;

/** Un signalement de bug du joueur est clos par l'équipe. */
export const contenuSignalementClosSchema = z.object({
  reportId: entier.positive(),
  status: z.enum(['resolved', 'rejected']),
  /** Début du texte du joueur, pour qu'il s'y retrouve. */
  excerpt: z.string(),
});
export type ContenuSignalementClos = z.infer<typeof contenuSignalementClosSchema>;

const message = { id: entier.positive(), createdAt: entier, readAt: entier.nullable() };

const messageChantierFini = z.object({ ...message, kind: z.literal('building_done'), payload: chantierFiniSchema });
const messageOpaRecue = z.object({ ...message, kind: z.literal('takeover_received'), payload: contenuOpaRecueSchema });
const messageOpaTerminee = z.object({
  ...message,
  kind: z.literal('takeover_resolved'),
  payload: contenuOpaTermineeSchema,
});
const messageQueteTerminee = z.object({
  ...message,
  kind: z.literal('quest_completed'),
  payload: contenuQueteTermineeSchema,
});
const messageNouveauRang = z.object({ ...message, kind: z.literal('rank_up'), payload: contenuNouveauRangSchema });

export const notificationSchema = z.discriminatedUnion('kind', [
  messageChantierFini,
  messageOpaRecue,
  messageOpaTerminee,
  z.object({ ...message, kind: z.literal('inactivity_warning'), payload: contenuAvertissementInactiviteSchema }),
  z.object({ ...message, kind: z.literal('inactivity_released'), payload: contenuLiberationInactiviteSchema }),
  messageQueteTerminee,
  messageNouveauRang,
  z.object({ ...message, kind: z.literal('gift_received'), payload: contenuCadeauSchema }),
  z.object({ ...message, kind: z.literal('report_closed'), payload: contenuSignalementClosSchema }),
  z.object({ ...message, kind: z.literal('project_completed'), payload: contenuProjetReussiSchema }),
]);
/** Un message du jeu (à ne pas confondre avec `Notification` du navigateur). */
export type NotificationJeu = z.infer<typeof notificationSchema>;
export type TypeNotification = NotificationJeu['kind'];

// GET /me/notifications?before=<id>&limit=20 — les plus récents d'abord

export const NOTIFICATIONS_PAR_PAGE = 20;

export const notificationsQuerySchema = z.object({
  /** Page suivante : les messages plus anciens que celui-ci (`nextCursor` de la page d'avant). */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(NOTIFICATIONS_PAR_PAGE),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const notificationsReponseSchema = z.object({
  notifications: z.array(notificationSchema),
  /** `null` s'il n'y a pas de messages plus anciens. */
  nextCursor: entier.positive().nullable(),
  unreadNotifications: entier.nonnegative(),
});
export type NotificationsReponse = z.infer<typeof notificationsReponseSchema>;

// GET /events — flux SSE : `event: <type>` puis `data: <JSON>`. Le front relit les requêtes concernées
// (TanStack Query) et affiche un toast.

export const evenementDirectSchema = z.discriminatedUnion('type', [
  // Tous sauf le dernier portent le message tel qu'il apparaît dans le centre de notifications.
  z.object({ type: z.literal('takeover.received'), data: messageOpaRecue }),
  z.object({ type: z.literal('takeover.resolved'), data: messageOpaTerminee }),
  z.object({ type: z.literal('building.done'), data: messageChantierFini }),
  z.object({ type: z.literal('quest.completed'), data: messageQueteTerminee }),
  z.object({ type: z.literal('rank.up'), data: messageNouveauRang }),
  /** Le portefeuille a bougé sans que le joueur agisse (OPA, rachat) : nouveau solde et revenu. */
  z.object({
    type: z.literal('wallet.changed'),
    data: portefeuilleSchema.extend({ incomePerHour: entier.nonnegative() }),
  }),
]);
export type EvenementDirect = z.infer<typeof evenementDirectSchema>;
export type TypeEvenementDirect = EvenementDirect['type'];
