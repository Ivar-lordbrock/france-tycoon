// Données de test partagées par les *.spec.ts de l'import.
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ProprietesCommuneApi } from './api-geo.ts';

export function carre(ouest: number, sud: number, cote: number): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [ouest, sud],
        [ouest + cote, sud],
        [ouest + cote, sud + cote],
        [ouest, sud + cote],
        [ouest, sud],
      ],
    ],
  };
}

export function commune(
  proprietes: Partial<ProprietesCommuneApi>,
  geometrie: Polygon | MultiPolygon | null = carre(4.35, 45.4, 0.08),
): Feature<Polygon | MultiPolygon | null, ProprietesCommuneApi> {
  return {
    type: 'Feature',
    properties: { nom: 'Saint-Étienne', code: '42218', codeDepartement: '42', codeRegion: '84', ...proprietes },
    geometry: geometrie,
  };
}
