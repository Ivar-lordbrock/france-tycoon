import { z } from 'zod';
import { jourSchema } from './quetes.ts';

// Appels à projets de l'État (docs/04-api.md, « Appels à projets » ; règles dans docs/05, 5.11).
// Un objectif commun à tous les joueurs, du lundi au dimanche (heure de Paris). Réussi : la prime est versée seule.

const entier = z.number().int();

/** L'appel à projets de la semaine, vu par un joueur. */
export const appelAProjetsSchema = z.object({
  /** Code dans `APPELS_A_PROJETS` (balance.ts). */
  code: z.string(),
  title: z.string(),
  /** Texte avec `{target}` déjà remplacé. */
  description: z.string(),
  target: entier.positive(),
  /** Ne dépasse jamais `target`. */
  progress: entier.nonnegative(),
  /** Réussi : la prime versée. Sinon : la prime au revenu du moment (elle est figée quand il est réussi). */
  rewardCash: entier.nonnegative(),
  rewardGems: entier.nonnegative(),
  /** Réussi : la prime a été versée à cet instant. */
  completedAt: entier.nullable(),
});
export type AppelAProjetsJoueur = z.infer<typeof appelAProjetsSchema>;

// GET /me/state-project

export const appelAProjetsReponseSchema = z.object({
  /** Lundi de la semaine, `AAAA-MM-JJ`. */
  week: jourSchema,
  /** Prochain lundi minuit à Paris (secondes Unix) : un nouveau projet à cet instant. */
  endsAt: entier,
  project: appelAProjetsSchema,
});
export type AppelAProjetsReponse = z.infer<typeof appelAProjetsReponseSchema>;
