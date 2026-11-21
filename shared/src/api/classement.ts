import { z } from 'zod';
import { ZONE_CODES } from '../zones.ts';

// Routes /leaderboard et /players de l'étape 5 (docs/04-api.md, « Classement »), règles dans docs/05 (5.4).
// Patrimoines et rangs recalculés toutes les 10 min par la tâche `leaderboard` (`CLASSEMENT_TOUTES_LES_S`).

const entier = z.number().int();

/**
 * `national` (tout le monde), `metropole`, `outre_mer`, ou `region:<code>` (`REGIONS` de zones.ts).
 * Hors national, on apparaît si on possède au moins une commune dans la portée, classé par patrimoine total.
 */
export const porteeClassementSchema = z.union([
  z.enum(['national', 'metropole', 'outre_mer']),
  z.string().regex(/^region:\d{2,3}$/),
]);
export type PorteeClassement = z.infer<typeof porteeClassementSchema>;

export const CLASSEMENT_PAR_PAGE = 50;

// GET /leaderboard?scope=national&cursor=

export const classementQuerySchema = z.object({
  scope: porteeClassementSchema.default('national'),
  /** Page suivante : les joueurs classés après ce rang (`nextCursor` de la page d'avant). */
  cursor: z.coerce.number().int().positive().optional(),
});
export type ClassementQuery = z.infer<typeof classementQuerySchema>;

export const ligneClassementSchema = z.object({
  /** Place dans la portée ; à patrimoine égal, le compte le plus ancien passe devant. */
  rank: entier.positive(),
  pseudo: z.string(),
  avatar: z.string().nullable(),
  markerColor: z.string(),
  netWorth: entier.nonnegative(),
  /** Communes possédées (toutes zones). */
  territories: entier.nonnegative(),
  /** 0 Entrepreneur … 4 Tycoon (`RANGS`). */
  rankLevel: entier.nonnegative(),
});
export type LigneClassement = z.infer<typeof ligneClassementSchema>;

export const classementReponseSchema = z.object({
  scope: porteeClassementSchema,
  players: z.array(ligneClassementSchema),
  /** `null` s'il n'y a personne après. */
  nextCursor: entier.positive().nullable(),
  /** Ma ligne si je suis connecté et présent dans la portée, sinon `null`. */
  me: ligneClassementSchema.nullable(),
  /** Dernier passage de la tâche `leaderboard` (secondes Unix) ; `null` avant le premier. */
  updatedAt: entier.nullable(),
});
export type ClassementReponse = z.infer<typeof classementReponseSchema>;

// GET /players/:pseudo — profil public : rien de privé (ni cash, ni gemmes, ni e-mail)

export const joueurParamsSchema = z.object({ pseudo: z.string().min(3).max(24) });

export const profilPublicSchema = z.object({
  pseudo: z.string(),
  avatar: z.string().nullable(),
  markerColor: z.string(),
  rankLevel: entier.nonnegative(),
  netWorth: entier.nonnegative(),
  /** Place au classement national. */
  nationalRank: entier.positive(),
  /** Date d'inscription (secondes Unix). */
  createdAt: entier,
  territories: z.array(
    z.object({ insee: z.string(), name: z.string(), zone: z.enum(ZONE_CODES), isCapital: z.boolean() }),
  ),
});
export type ProfilPublic = z.infer<typeof profilPublicSchema>;
