import {
  BALANCE_VERSION,
  type ComptesInfra,
  emplacements,
  scoreInfra,
  typeDeRegion,
  valeurBase,
  type ZoneCode,
  zoneDuDepartement,
} from '@france-tycoon/shared';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ProprietesCommuneApi } from './api-geo.ts';
import { type Boite, boite, centre, DETAILS, type Surface, simplifier } from './geometrie.ts';

/** Une commune prête à écrire dans `territories`, `territory_geometries` et `territories_rtree`. */
export interface TerritoireImporte {
  insee: string;
  nom: string;
  departement: string;
  region: string | null;
  typeRegion: 'metropole' | 'outre_mer';
  zone: ZoneCode;
  population: number;
  surfaceKm2: number | null;
  centre: { lat: number; lng: number };
  infra: number;
  valeurBase: number;
  emplacements: number;
  balanceVersion: number;
  boite: Boite;
  /** GeoJSON (géométrie seule) pour les zooms 9–10. */
  contourLow: string;
  /** GeoJSON (géométrie seule) pour les zooms ≥ 11. */
  contourHigh: string;
  /** Contour brut, gardé en mémoire pour fusionner les départements. */
  geometrie: Surface;
}

export type Rejet = { insee: string; raison: string };

/**
 * Transforme une commune de l'API Geo. V0 et emplacements avec les formules de
 * shared/src/balance.ts ; `I` vient de `territory_stats` (0 tant que BPE et OSM ne sont pas importés).
 */
export function versTerritoire(
  commune: Feature<Polygon | MultiPolygon | null, ProprietesCommuneApi>,
  comptes: ComptesInfra = {},
): TerritoireImporte | Rejet {
  const { code, nom, codeDepartement, codeRegion, population, surface } = commune.properties;
  if (!/^[0-9][0-9AB][0-9]{3}$/.test(code)) return { insee: code, raison: 'code INSEE invalide' };

  const zone = zoneDuDepartement(codeDepartement);
  if (!zone) return { insee: code, raison: `département ${codeDepartement} hors des 12 zones` };

  const geometrie = commune.geometry;
  if (!geometrie || (geometrie.type !== 'Polygon' && geometrie.type !== 'MultiPolygon')) {
    return { insee: code, raison: 'pas de contour' };
  }

  const habitants = Math.max(0, Math.round(population ?? 0));
  const infra = scoreInfra(comptes);
  return {
    insee: code,
    nom,
    departement: codeDepartement,
    region: codeRegion ?? null,
    typeRegion: typeDeRegion(codeDepartement),
    zone,
    population: habitants,
    surfaceKm2: surface == null ? null : Math.round(surface) / 100, // l'API donne des hectares
    centre: centre(geometrie),
    infra,
    valeurBase: valeurBase(habitants, infra),
    emplacements: emplacements(habitants),
    balanceVersion: BALANCE_VERSION,
    boite: boite(geometrie),
    contourLow: JSON.stringify(simplifier(geometrie, DETAILS.low.tolerance, DETAILS.low.decimales)),
    contourHigh: JSON.stringify(simplifier(geometrie, DETAILS.high.tolerance, DETAILS.high.decimales)),
    geometrie,
  };
}

export function estRejet(resultat: TerritoireImporte | Rejet): resultat is Rejet {
  return 'raison' in resultat;
}
