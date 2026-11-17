import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

type LatLng = [number, number];

/** Rectangle du monde visible en Web Mercator (au-delà de ±85°, Leaflet ne dessine rien). */
const MONDE: Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/**
 * Anneaux du masque gris : le monde, puis tous les anneaux des zones françaises. Dessinés en
 * remplissage pair-impair, les zones deviennent des trous (et une enclave étrangère, comme Llívia,
 * redevient grise). Coordonnées en [lat, lng] pour Leaflet.
 */
export function anneauxDuMasque(zones: FeatureCollection<Polygon | MultiPolygon>): LatLng[][] {
  const anneaux: Position[][] = [MONDE];
  for (const { geometry } of zones.features) {
    const polygones = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygone of polygones) anneaux.push(...polygone);
  }
  return anneaux.map((anneau) => anneau.map(([lng = 0, lat = 0]) => [lat, lng] as LatLng));
}
