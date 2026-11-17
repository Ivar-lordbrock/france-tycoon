import { z } from 'zod';
import { CATEGORIES_INFRA } from '../balance.ts';
import { ZONE_CODES } from '../zones.ts';
import { ETATS_TERRITOIRE } from './carte.ts';
import { CODES_ERREUR } from './erreurs.ts';

// GET /api/v1/territories/:insee : la fiche d'une commune (docs/04-api.md, « Carte »).

/** Code INSEE : 5 caractères, 2A/2B pour la Corse. */
export const inseeParamsSchema = z.object({
  insee: z
    .string()
    .regex(/^\d[\dAB]\d{3}$/i, 'code INSEE attendu (5 caractères)')
    .transform((code) => code.toUpperCase()),
});

const entier = z.number().int();
const raisonsSchema = z.array(z.enum(CODES_ERREUR));

export const ficheCommuneSchema = z.object({
  insee: z.string(),
  name: z.string(),
  department: z.string(),
  zone: z.enum(ZONE_CODES),
  regionType: z.enum(['metropole', 'outre_mer']),
  population: entier.nonnegative(),
  areaKm2: z.number().nullable(),
  center: z.object({ lat: z.number(), lng: z.number() }),
  /** Score d'infrastructures I (5.1). */
  infraScore: z.number().nonnegative(),
  /** Équipements comptés, par catégorie (BPE en priorité, OSM sinon ; voir 5.1). */
  equipments: z.array(
    z.object({ category: z.enum(CATEGORIES_INFRA), count: entier.positive(), source: z.enum(['bpe', 'osm']) }),
  ),
  /** V0 : prix d'achat quand la commune est libre. */
  baseValue: entier.positive(),
  /** V_T = V0 + bâtiments + fortifications (5.4). */
  totalValue: entier.positive(),
  incomePerHour: entier.nonnegative(),
  buildingSlots: z.object({ total: entier.positive(), used: entier.nonnegative() }),
  state: z.enum(ETATS_TERRITOIRE),
  owner: z
    .object({ pseudo: z.string(), markerColor: z.string(), avatarUrl: z.string().nullable(), isMe: z.boolean() })
    .nullable(),
  isCapital: z.boolean(),
  /** Fin du bouclier en cours (secondes Unix), `null` s'il n'y en a pas. */
  shieldUntil: entier.nullable(),
  takeover: z.object({ id: entier, endsAt: entier }).nullable(),
  buildings: z.array(
    z.object({
      id: entier,
      typeCode: z.string(),
      name: z.string(),
      level: entier.nonnegative(),
      targetLevel: entier.nullable(),
      worksEndsAt: entier.nullable(),
    }),
  ),
  /**
   * Ce que le joueur connecté peut faire ici ; les raisons sont des codes d'erreur de l'API.
   * `canTakeover` reste à false tant que les OPA ne sont pas ouvertes (étape 4).
   */
  actions: z.object({
    canBuy: z.boolean(),
    buyPrice: entier.positive().nullable(),
    buyReasons: raisonsSchema,
    canTakeover: z.boolean(),
    takeoverReasons: raisonsSchema,
  }),
});
export type FicheCommune = z.infer<typeof ficheCommuneSchema>;
