import { z } from 'zod';
import { ZONE_CODES } from '../zones.ts';

// Routes /api/v1/map (docs/04-api.md, « Carte »). Les mêmes schémas servent au serveur et au front.

/** En dessous, la carte montre les départements (fichier statique) et pas les communes. */
export const ZOOM_MIN_COMMUNES = 9;
/** À partir de ce zoom, les contours `high` remplacent les contours `low`. */
export const ZOOM_CONTOURS_PRECIS = 11;
/** Au-delà, la réponse est tronquée (les communes les plus peuplées d'abord) et `truncated` vaut true. */
export const MAX_COMMUNES_PAR_REQUETE = 3000;
export const MAX_RESULTATS_RECHERCHE = 10;

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

/** Boîte [ouest, sud, est, nord] en degrés WGS 84. */
export const boiteSchema = z.tuple([longitude, latitude, longitude, latitude]);
export type BoiteCarte = z.infer<typeof boiteSchema>;

const boiteTexteSchema = z
  .string()
  .transform((texte) => texte.split(',').map((morceau) => (morceau.trim() === '' ? Number.NaN : Number(morceau))))
  .pipe(boiteSchema)
  .refine(([ouest, sud, est, nord]) => ouest < est && sud < nord, 'bbox attendue : ouest,sud,est,nord');

// GET /map/zones

export const zoneCarteSchema = z.object({
  code: z.enum(ZONE_CODES),
  name: z.string(),
  bbox: boiteSchema,
  zoom: z.number().int(),
});
export type ZoneCarte = z.infer<typeof zoneCarteSchema>;

export const zonesReponseSchema = z.object({ zones: z.array(zoneCarteSchema) });
export type ZonesReponse = z.infer<typeof zonesReponseSchema>;

// GET /map/territories?bbox=W,S,E,N&zoom=Z

export const territoiresQuerySchema = z.object({
  bbox: boiteTexteSchema,
  zoom: z.coerce
    .number()
    .int()
    .min(ZOOM_MIN_COMMUNES, `zoom ${ZOOM_MIN_COMMUNES} minimum : en dessous, la carte affiche les départements`)
    .max(22),
});

export const ETATS_TERRITOIRE = ['free', 'mine', 'rival', 'takeover', 'shield'] as const;
export type EtatTerritoire = (typeof ETATS_TERRITOIRE)[number];

export const proprietesCommuneCarteSchema = z.object({
  insee: z.string(),
  name: z.string(),
  state: z.enum(ETATS_TERRITOIRE),
  ownerColor: z.string().nullable(),
  ownerPseudo: z.string().nullable(),
});
export type ProprietesCommuneCarte = z.infer<typeof proprietesCommuneCarteSchema>;

const position = z.array(z.number()).min(2);
const contourSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(position))) }),
]);

export const communeCarteSchema = z.object({
  type: z.literal('Feature'),
  id: z.string(),
  properties: proprietesCommuneCarteSchema,
  geometry: contourSchema,
});
export type CommuneCarte = z.infer<typeof communeCarteSchema>;

/** Le serveur assemble ce JSON à la main (contours déjà stockés en texte) : ce schéma sert aux tests et au typage. */
export const territoiresReponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(communeCarteSchema),
  truncated: z.boolean(),
});
export type TerritoiresReponse = z.infer<typeof territoiresReponseSchema>;

// GET /map/search?q=...

export const rechercheQuerySchema = z.object({ q: z.string().trim().min(1).max(80) });

export const resultatRechercheSchema = z.object({
  insee: z.string(),
  name: z.string(),
  department: z.string(),
  zone: z.enum(ZONE_CODES),
  population: z.number().int().nonnegative(),
  center: z.object({ lat: z.number(), lng: z.number() }),
  bbox: boiteSchema,
});
export type ResultatRecherche = z.infer<typeof resultatRechercheSchema>;

export const rechercheReponseSchema = z.object({ results: z.array(resultatRechercheSchema) });
export type RechercheReponse = z.infer<typeof rechercheReponseSchema>;

/** Minuscules, sans accents ni ponctuation : « L'Haÿ-les-Roses » → « l hay les roses ». */
export function normaliserNom(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
