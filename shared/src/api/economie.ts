import { z } from 'zod';
import { NIVEAU_MAX_BATIMENT } from '../balance.ts';
import { ZONE_CODES } from '../zones.ts';
import { ficheCommuneSchema, inseeParamsSchema } from './territoires.ts';

// Routes de l'étape 3 (docs/04-api.md, « Territoires et bâtiments ») : achat, vente, bâtiments, revenus.
// Contrat écrit avant le code (règle « contrat d'abord », docs/06) : le front peut coder contre ces formats.
// Les ajouts à des réponses existantes (`/me`, fiche de commune) arrivent avec les paquets qui les remplissent.

const entier = z.number().int();
const niveau = entier.min(0).max(NIVEAU_MAX_BATIMENT);

export const portefeuilleSchema = z.object({ cash: entier.nonnegative(), gems: entier.nonnegative() });
export type Portefeuille = z.infer<typeof portefeuilleSchema>;

/** Même liste que `building_types.category` (001_initial.sql). */
export const CATEGORIES_BATIMENT = ['logement', 'commerce', 'industrie', 'infrastructure', 'siege'] as const;

// GET /building-types : le catalogue. Une entrée se passe telle quelle aux formules de balance.ts
// (`coutNiveau`, `revenuNiveau`, `dureeChantier`…) pour les aperçus.

export const typeBatimentSchema = z.object({
  code: z.string(),
  name: z.string(),
  category: z.enum(CATEGORIES_BATIMENT),
  description: z.string().nullable(),
  baseCost: entier.positive(),
  costGrowth: z.number().min(1),
  baseIncomePerHour: entier.nonnegative(),
  incomeGrowth: z.number().min(1),
  /** Bonus sur tout le territoire, en % par niveau (équipement public, gare). */
  incomeBonusPct: entier.nonnegative(),
  /** Territoires max en plus, par niveau (siège social). */
  territorySlotBonus: entier.nonnegative(),
  baseBuildSeconds: entier.positive(),
  timeGrowth: z.number().min(1),
  maxLevel: entier.min(1).max(NIVEAU_MAX_BATIMENT),
  /** Emplacements occupés sur le territoire. */
  slotSize: entier.positive(),
  /** `null` : pas de limite (dans la limite des emplacements). */
  maxPerTerritory: entier.positive().nullable(),
  maxPerUser: entier.positive().nullable(),
  minPopulation: entier.nonnegative(),
  /** Faux pour le siège social : son coût ne dépend pas de la taille de la commune. */
  scalesWithTerritory: z.boolean(),
});
export type TypeBatiment = z.infer<typeof typeBatimentSchema>;

export const catalogueBatimentsSchema = z.object({ buildingTypes: z.array(typeBatimentSchema) });
export type CatalogueBatiments = z.infer<typeof catalogueBatimentsSchema>;

// Bâtiments et chantiers d'un joueur

/** `:id` d'un bâtiment dans l'URL. */
export const batimentParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const batimentSchema = z.object({
  id: entier,
  territoryInsee: z.string(),
  typeCode: z.string(),
  name: z.string(),
  /** Niveau actif ; 0 pendant la première construction. */
  level: niveau,
  /** Niveau en construction, `null` s'il n'y a pas de chantier. */
  targetLevel: niveau.nullable(),
  worksStartedAt: entier.nullable(),
  worksEndsAt: entier.nullable(),
  /** B : cash investi (5.4), chantier en cours compris. */
  investedCash: entier.nonnegative(),
  incomePerHour: entier.nonnegative(),
  bonusPct: entier.nonnegative(),
});
export type Batiment = z.infer<typeof batimentSchema>;

export const chantierSchema = z.object({
  buildingId: entier,
  territoryInsee: z.string(),
  territoryName: z.string(),
  typeCode: z.string(),
  name: z.string(),
  targetLevel: niveau.min(1),
  startedAt: entier,
  endsAt: entier,
  /** Prix payé pour ce chantier : rendu en entier s'il est annulé. */
  cost: entier.positive(),
});
export type Chantier = z.infer<typeof chantierSchema>;

/** Un chantier terminé pendant l'absence du joueur (résumé au retour). */
export const chantierFiniSchema = z.object({
  buildingId: entier,
  territoryInsee: z.string(),
  territoryName: z.string(),
  typeCode: z.string(),
  name: z.string(),
  level: niveau.min(1),
  finishedAt: entier,
});
export type ChantierFini = z.infer<typeof chantierFiniSchema>;

/** Résumé au retour (GET /me) : un chantier fini pas encore vu, et le message à marquer comme lu. */
export const chantierFiniNonLuSchema = chantierFiniSchema.extend({ notificationId: entier });
export type ChantierFiniNonLu = z.infer<typeof chantierFiniNonLuSchema>;

// GET /me/construction-queue

export const fileConstructionSchema = z.object({
  /** Nombre de files du joueur (1 au départ). */
  slots: entier.positive(),
  works: z.array(chantierSchema),
});
export type FileConstruction = z.infer<typeof fileConstructionSchema>;

// GET /me/territories

export const monTerritoireSchema = z.object({
  insee: z.string(),
  name: z.string(),
  zone: z.enum(ZONE_CODES),
  baseValue: entier.positive(),
  totalValue: entier.positive(),
  incomePerHour: entier.nonnegative(),
  isCapital: z.boolean(),
  shieldUntil: entier.nullable(),
  buildingSlots: z.object({ total: entier.positive(), used: entier.nonnegative() }),
  works: z.array(chantierSchema),
});
export type MonTerritoire = z.infer<typeof monTerritoireSchema>;

export const mesTerritoiresSchema = z.object({
  territories: z.array(monTerritoireSchema),
  max: entier.positive(),
});
export type MesTerritoires = z.infer<typeof mesTerritoiresSchema>;

// POST /territories/:insee/buy — prix = V0, bouclier 12 h

export const achatReponseSchema = z.object({ territory: ficheCommuneSchema, wallet: portefeuilleSchema });
export type AchatReponse = z.infer<typeof achatReponseSchema>;

// POST /territories/:insee/sell — 70 % de V_T, bâtiments détruits

export const venteReponseSchema = z.object({
  insee: z.string(),
  saleAmount: entier.nonnegative(),
  wallet: portefeuilleSchema,
});
export type VenteReponse = z.infer<typeof venteReponseSchema>;

// POST /territories/:insee/buildings (construire) et POST /buildings/:id/upgrade (améliorer)

export const construireCorpsSchema = z.object({ typeCode: z.string().min(1).max(40) });
export type ConstruireCorps = z.infer<typeof construireCorpsSchema>;

export const chantierReponseSchema = z.object({ building: batimentSchema, wallet: portefeuilleSchema });
export type ChantierReponse = z.infer<typeof chantierReponseSchema>;

// POST /buildings/:id/cancel — tout est remboursé ; une première construction annulée supprime le bâtiment

export const annulationReponseSchema = z.object({
  /** `null` si le bâtiment a été supprimé (première construction annulée). */
  building: batimentSchema.nullable(),
  refunded: entier.nonnegative(),
  wallet: portefeuilleSchema,
});
export type AnnulationReponse = z.infer<typeof annulationReponseSchema>;

// DELETE /buildings/:id — rend 30 % de invested_cash

export const demolitionReponseSchema = z.object({ refunded: entier.nonnegative(), wallet: portefeuilleSchema });
export type DemolitionReponse = z.infer<typeof demolitionReponseSchema>;

// POST /me/collect

export const encaissementReponseSchema = z.object({
  collected: entier.nonnegative(),
  cash: entier.nonnegative(),
  incomePerHour: entier.nonnegative(),
});
export type EncaissementReponse = z.infer<typeof encaissementReponseSchema>;

// POST /me/capital — une fois tous les 7 jours

export const deplacerCapitaleCorpsSchema = inseeParamsSchema;

export const capitaleReponseSchema = z.object({
  capitalInsee: z.string(),
  /** Prochain déplacement possible (secondes Unix). */
  nextMoveAt: entier,
});
export type CapitaleReponse = z.infer<typeof capitaleReponseSchema>;
