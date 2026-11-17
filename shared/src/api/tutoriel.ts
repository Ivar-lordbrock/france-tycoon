import { z } from 'zod';
import { portefeuilleSchema } from './economie.ts';

// Routes /tutorial de l'étape 5 (docs/04-api.md, « Quêtes et tutoriel »), règles dans docs/05 (5.7).
// 10 étapes (table `tutorials`), 10 000 ₮ et 5 💎 au total, versés aux étapes 5, 7 et 10.

const entier = z.number().int();

/** Qui valide une étape : l'écran (`POST /tutorial/:stepKey/complete`) ou le serveur, quand l'action a lieu. */
export const VALIDATIONS_TUTORIEL = ['server', 'client'] as const;

export const etapeTutorielSchema = z.object({
  /** `tutorials.step_key`, ex. `premier_achat`. */
  key: z.string(),
  position: z.number().int().min(1),
  title: z.string(),
  body: z.string(),
  /** Élément mis en avant à l'écran : `[data-tuto="<anchor>"]` ; `null` = bulle au milieu. */
  anchor: z.string().nullable(),
  validatedBy: z.enum(VALIDATIONS_TUTORIEL),
  rewardCash: entier.nonnegative(),
  rewardGems: entier.nonnegative(),
  /** `null` tant que l'étape n'est pas faite. */
  completedAt: entier.nullable(),
});
export type EtapeTutoriel = z.infer<typeof etapeTutorielSchema>;

// GET /tutorial et POST /tutorial/skip

export const tutorielReponseSchema = z.object({
  /** Dans l'ordre de `position`. */
  steps: z.array(etapeTutorielSchema),
  /** Les 10 étapes faites (`users.tutorial_completed_at`). */
  completedAt: entier.nullable(),
  /** Le joueur a cliqué « Passer » : on ne lui montre plus le tutoriel. */
  skipped: z.boolean(),
});
export type TutorielReponse = z.infer<typeof tutorielReponseSchema>;

/** `:stepKey` dans l'URL. */
export const etapeTutorielParamsSchema = z.object({ stepKey: z.string().regex(/^[a-z_]{1,40}$/) });

// POST /tutorial/:stepKey/complete — seulement les étapes `validatedBy = 'client'` (sinon FORBIDDEN).
// Rejouer une étape déjà faite ne fait rien (pas de double récompense).

export const etapeFaiteReponseSchema = tutorielReponseSchema.extend({ wallet: portefeuilleSchema });
export type EtapeFaiteReponse = z.infer<typeof etapeFaiteReponseSchema>;
