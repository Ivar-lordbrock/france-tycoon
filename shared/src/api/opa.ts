import { z } from 'zod';
import { ZONE_CODES } from '../zones.ts';
import { portefeuilleSchema } from './economie.ts';
import { CODES_ERREUR } from './erreurs.ts';

// Routes de l'étape 4 (docs/04-api.md, « PvP : OPA »), règles dans docs/05 (5.5).
// Contrat écrit avant le code (règle « contrat d'abord », docs/06) : le front peut coder contre ces formats.
// Les ajouts à des réponses existantes (`/me`, fiche de commune) arrivent avec les paquets qui les remplissent.

const entier = z.number().int();

/** Issues d'une OPA terminée (5.5). */
export const STATUTS_OPA_TERMINEE = [
  'defended', // le défenseur a payé la défense : il garde sa commune
  'accepted', // le défenseur a vendu tout de suite
  'succeeded', // 24 h sans réponse : la commune passe à l'attaquant
  'cancelled', // l'attaquant a retiré son offre
  'voided', // annulée par le système (défenseur libéré pour inactivité, compte banni) : tout est rendu
] as const;

/** Même liste que `takeovers.status` (001_initial.sql) : `pending` pendant les 24 h pour réagir. */
export const STATUTS_OPA = ['pending', ...STATUTS_OPA_TERMINEE] as const;
export type StatutOpa = (typeof STATUTS_OPA)[number];

export const ROLES_OPA = ['attacker', 'defender'] as const;
export type RoleOpa = (typeof ROLES_OPA)[number];

/** Les trois montants, figés au lancement (`montantsOpa` de balance.ts). */
const montants = {
  /** V_T au moment du devis ou du lancement. */
  territoryValue: entier.positive(),
  /** P_OPA : bloqué chez l'attaquant (séquestre) pendant l'OPA. */
  offerAmount: entier.positive(),
  /** D : ce que paie le défenseur pour garder sa commune. */
  defenseCost: entier.positive(),
  /** i : versée au défenseur si l'OPA est défendue ou retirée. */
  breakFee: entier.nonnegative(),
};

// GET /territories/:insee/takeover-quote

export const devisOpaSchema = z.object({
  ...montants,
  eligible: z.boolean(),
  /** Pourquoi l'OPA n'est pas possible (codes d'erreur de l'API) ; vide si `eligible`. */
  reasons: z.array(z.enum(CODES_ERREUR)),
});
export type DevisOpa = z.infer<typeof devisOpaSchema>;

// Une OPA vue par l'attaquant ou le défenseur

const joueurOpaSchema = z.object({ pseudo: z.string(), markerColor: z.string() });

export const opaSchema = z.object({
  id: entier.positive(),
  territory: z.object({ insee: z.string(), name: z.string(), zone: z.enum(ZONE_CODES) }),
  attacker: joueurOpaSchema,
  defender: joueurOpaSchema,
  /** Rôle du joueur connecté dans cette OPA. */
  role: z.enum(ROLES_OPA),
  ...montants,
  status: z.enum(STATUTS_OPA),
  createdAt: entier,
  /** Fin des 24 h pour réagir (secondes Unix). */
  expiresAt: entier,
  /** `null` tant que l'OPA est en cours. */
  resolvedAt: entier.nullable(),
});
export type Opa = z.infer<typeof opaSchema>;

/** `:id` d'une OPA dans l'URL. */
export const opaParamsSchema = z.object({ id: z.coerce.number().int().positive() });

// POST /territories/:insee/takeovers (lancer), POST /takeovers/:id/defend | accept | cancel :
// l'OPA à jour et le portefeuille du joueur connecté (séquestre, défense, offre reçue ou remboursement).

export const opaReponseSchema = z.object({ takeover: opaSchema, wallet: portefeuilleSchema });
export type OpaReponse = z.infer<typeof opaReponseSchema>;

// GET /takeovers/:id — résout l'OPA si ses 24 h sont passées

export const detailOpaReponseSchema = z.object({ takeover: opaSchema });
export type DetailOpaReponse = z.infer<typeof detailOpaReponseSchema>;

// GET /me/takeovers?role=attacker|defender&status=pending — les plus récentes d'abord

export const mesOpaQuerySchema = z.object({
  role: z.enum(ROLES_OPA).optional(),
  status: z.enum(STATUTS_OPA).optional(),
});
export type MesOpaQuery = z.infer<typeof mesOpaQuerySchema>;

export const mesOpaReponseSchema = z.object({ takeovers: z.array(opaSchema) });
export type MesOpaReponse = z.infer<typeof mesOpaReponseSchema>;
