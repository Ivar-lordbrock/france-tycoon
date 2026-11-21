import { z } from 'zod';
import { portefeuilleSchema } from './economie.ts';

// Routes de l'étape 5 (docs/04-api.md, « Quêtes et tutoriel »), règles dans docs/05 (5.7).
// Contrat écrit avant le code (règle « contrat d'abord », docs/06) : le front peut coder contre ces formats.
// Les ajouts aux unions existantes (événement `quest.completed`, messages) arrivent avec les paquets qui les envoient.

const entier = z.number().int();

/** Même liste que `daily_quests.difficulty` (001_initial.sql) : une quête de chaque par jour. */
export const DIFFICULTES_QUETE = ['facile', 'moyen', 'difficile'] as const;
export type DifficulteQuete = (typeof DIFFICULTES_QUETE)[number];

/** Même liste que `daily_quests.event_type` (001_initial.sql) : ce qui fait avancer une quête. */
export const EVENEMENTS_QUETE = [
  'login',
  'income_collected',
  'territory_visited',
  'zone_visited',
  'territory_bought',
  'building_started',
  'building_upgraded',
  'takeover_launched',
  'takeover_defended',
  'leaderboard_viewed',
] as const;
export type EvenementQuete = (typeof EVENEMENTS_QUETE)[number];

/** Jour du jeu à Paris, `AAAA-MM-JJ` (`jourParis` de balance.ts). */
export const jourSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Une des 3 quêtes du jour d'un joueur (ligne de `user_quests` + son modèle dans `daily_quests`). */
export const queteSchema = z.object({
  /** `user_quests.id` : c'est lui qu'on réclame. */
  id: entier.positive(),
  /** 1 facile, 2 moyenne, 3 difficile. */
  slot: z.number().int().min(1).max(3),
  code: z.string(),
  title: z.string(),
  /** Texte avec `{target}` déjà remplacé par l'objectif tiré. */
  description: z.string(),
  difficulty: z.enum(DIFFICULTES_QUETE),
  eventType: z.enum(EVENEMENTS_QUETE),
  target: entier.positive(),
  /** Ne dépasse jamais `target`. */
  progress: entier.nonnegative(),
  /** Figée au tirage : max( cash_min ; arrondi_100( h × revenu/h ) ) (`recompenseQuete`). */
  rewardCash: entier.nonnegative(),
  rewardGems: entier.nonnegative(),
  /** Objectif atteint : la récompense attend d'être réclamée. */
  completedAt: entier.nullable(),
  claimedAt: entier.nullable(),
});
export type Quete = z.infer<typeof queteSchema>;

// GET /me/quests — tirées au premier appel de la journée (heure de Paris), même tirage si on recharge

export const quetesReponseSchema = z.object({
  date: jourSchema,
  /** Prochain minuit à Paris (secondes Unix) : de nouvelles quêtes à cet instant. */
  resetsAt: entier,
  quests: z.array(queteSchema).max(3),
});
export type QuetesReponse = z.infer<typeof quetesReponseSchema>;

/** `:id` d'une quête dans l'URL. */
export const queteParamsSchema = z.object({ id: z.coerce.number().int().positive() });

// POST /me/quests/:id/claim — la quête réclamée et le portefeuille après la récompense (`quest_reward`)

export const reclamerQueteReponseSchema = z.object({ quest: queteSchema, wallet: portefeuilleSchema });
export type ReclamerQueteReponse = z.infer<typeof reclamerQueteReponseSchema>;

// POST /events/track — ce que seul l'écran voit (fiche ouverte, zone visitée, classement consulté).
// Fait avancer quêtes et tutoriel ; réponse 204 (le front relit ensuite quêtes et tutoriel). 60 par minute.

export const TYPES_SUIVI = ['territory_visited', 'zone_visited', 'leaderboard_viewed'] as const;
export type TypeSuivi = (typeof TYPES_SUIVI)[number];

export const suiviCorpsSchema = z.object({
  type: z.enum(TYPES_SUIVI),
  /** Code INSEE (fiche), code de zone (`GP`…) ou portée du classement. Une même commune ou zone ne compte qu'une fois par jour. */
  ref: z.string().min(1).max(40),
});
export type SuiviCorps = z.infer<typeof suiviCorpsSchema>;
