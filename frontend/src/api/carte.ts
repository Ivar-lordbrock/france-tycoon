import { type RechercheReponse, type TerritoiresReponse, ZONES, type ZonesReponse } from '@france-tycoon/shared';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Case } from '../map/cases.ts';
import { lireJson } from './client.ts';

/** Les zones sont aussi dans `shared` : affichées tout de suite, puis confirmées par `/map/zones` (une fois). */
const ZONES_LOCALES: ZonesReponse = {
  zones: ZONES.map(({ code, nom, bbox, zoom }) => ({ code, name: nom, bbox, zoom })),
};

export function useZones() {
  return useQuery({
    queryKey: ['carte', 'zones'],
    queryFn: ({ signal }) => lireJson<ZonesReponse>('/api/v1/map/zones', signal),
    placeholderData: ZONES_LOCALES,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export type ProprietesDepartement = { code: string; nom: string; zone: string };
export type ProprietesZone = { zone: string };
type Contours<P> = FeatureCollection<Polygon | MultiPolygon, P>;

/** Fichiers statiques générés par l'import des communes (`frontend/public/geo/`). */
export function useDepartements() {
  return useQuery({
    queryKey: ['geo', 'departements'],
    queryFn: ({ signal }) => lireJson<Contours<ProprietesDepartement>>('/geo/departements.json', signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useContoursZones() {
  return useQuery({
    queryKey: ['geo', 'france'],
    queryFn: ({ signal }) => lireJson<Contours<ProprietesZone>>('/geo/france.json', signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Communes d'une case de la carte. Le cache est gardé 5 min ; l'ETag évite de retélécharger. */
export function requeteCase(c: Case) {
  return queryOptions({
    queryKey: ['carte', 'communes', c.cle],
    queryFn: ({ signal }) =>
      lireJson<TerritoiresReponse>(`/api/v1/map/territories?bbox=${c.bbox.join(',')}&zoom=${c.zoom}`, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useRecherche(saisie: string) {
  const q = saisie.trim();
  return useQuery({
    queryKey: ['carte', 'recherche', q],
    queryFn: ({ signal }) => lireJson<RechercheReponse>(`/api/v1/map/search?q=${encodeURIComponent(q)}`, signal),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
