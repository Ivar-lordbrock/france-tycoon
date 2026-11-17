import { z } from 'zod';
import { chantierFiniNonLuSchema } from './economie.ts';

// Routes /api/v1/auth et /api/v1/me (docs/04-api.md, « Authentification et profil »).

export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 24;

/** Pseudo affiché sur la carte et au classement : 3 à 24 caractères, unique sans tenir compte des majuscules. */
export const pseudoSchema = z
  .string()
  .trim()
  .min(PSEUDO_MIN, `${PSEUDO_MIN} caractères minimum`)
  .max(PSEUDO_MAX, `${PSEUDO_MAX} caractères maximum`)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, 'lettres, chiffres, espaces, points, tirets ou soulignés');

/** Couleur de marqueur au format `#rrggbb` (même règle que la colonne `users.marker_color`). */
export const couleurSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur attendue : #rrggbb');

// GET /auth/config : ce que l'écran de connexion doit proposer.

export const configConnexionSchema = z.object({
  /** ID client OAuth public (pas un secret) ; `null` tant que `GOOGLE_CLIENT_ID` est vide. */
  googleClientId: z.string().nullable(),
  /** Connexion de développement (sans Google) : seulement en local, jamais en production. */
  devLogin: z.boolean(),
});
export type ConfigConnexion = z.infer<typeof configConnexionSchema>;

// POST /auth/google

export const connexionGoogleCorpsSchema = z.object({
  /** Jeton d'identité (JWT) renvoyé par le bouton Google. */
  credential: z.string().min(1).max(8_192),
});

// POST /auth/dev (local seulement)

export const connexionDevCorpsSchema = z.object({
  /** Nom du compte de test : le même nom reconnecte le même compte. */
  pseudo: pseudoSchema,
});

export const profilSchema = z.object({
  id: z.number().int(),
  pseudo: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  markerColor: couleurSchema,
  createdAt: z.number().int(),
});
export type Profil = z.infer<typeof profilSchema>;

export const connexionReponseSchema = z.object({ user: profilSchema, isNew: z.boolean() });
export type ConnexionReponse = z.infer<typeof connexionReponseSchema>;

// GET /me et PATCH /me

export const moiReponseSchema = z.object({
  user: profilSchema,
  wallet: z.object({ cash: z.number().int().nonnegative(), gems: z.number().int().nonnegative() }),
  /** Revenu passif total par heure : sol et bâtiments des territoires possédés (5.3). */
  incomePerHour: z.number().int().nonnegative(),
  territories: z.object({ owned: z.number().int().nonnegative(), max: z.number().int().positive() }),
  buildQueueSlots: z.number().int().positive(),
  /** Fin de la protection débutant (secondes Unix). */
  newbieShieldUntil: z.number().int(),
  unreadNotifications: z.number().int().nonnegative(),
  /**
   * Résumé au retour : chantiers finis pendant l'absence, pas encore vus (50 au plus, du plus ancien
   * au plus récent). Les marquer comme lus : POST /me/notifications/read.
   */
  finishedWorks: z.array(chantierFiniNonLuSchema),
});
export type MoiReponse = z.infer<typeof moiReponseSchema>;

export const modifierMoiCorpsSchema = z
  .object({ pseudo: pseudoSchema.optional(), markerColor: couleurSchema.optional() })
  .refine((corps) => corps.pseudo !== undefined || corps.markerColor !== undefined, 'rien à modifier');
export type ModifierMoiCorps = z.infer<typeof modifierMoiCorpsSchema>;
