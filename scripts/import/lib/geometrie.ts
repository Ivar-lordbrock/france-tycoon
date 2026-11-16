import simplify from '@turf/simplify';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';

export type Surface = Polygon | MultiPolygon;
export type Boite = [ouest: number, sud: number, est: number, nord: number];

/**
 * Deux niveaux de détail par commune (docs/02-stack-technique.md, 2.4) :
 * `low` pour les zooms 9–10 (< 1 pixel au zoom 10), `high` pour les zooms ≥ 11 (≈ 1 pixel au zoom 13).
 * Tolérances de Douglas-Peucker en degrés ; coordonnées arrondies (4 décimales ≈ 11 m, 5 ≈ 1 m).
 */
export const DETAILS = {
  low: { tolerance: 0.001, decimales: 4 },
  high: { tolerance: 0.0002, decimales: 5 },
} as const;

function polygones(geometrie: Surface): Position[][][] {
  return geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.coordinates;
}

function versSurface(liste: Position[][][]): Surface {
  return liste.length === 1 && liste[0]
    ? { type: 'Polygon', coordinates: liste[0] }
    : { type: 'MultiPolygon', coordinates: liste };
}

/** Arrondit les coordonnées, retire les points répétés et les anneaux devenus trop petits. */
export function arrondir(geometrie: Surface, decimales: number): Surface {
  const facteur = 10 ** decimales;
  const r = (x: number) => Math.round(x * facteur) / facteur;
  const resultat: Position[][][] = [];

  for (const polygone of polygones(geometrie)) {
    const anneaux: Position[][] = [];
    for (const [index, anneau] of polygone.entries()) {
      const points: Position[] = [];
      for (const point of anneau) {
        const p = [r(point[0] ?? 0), r(point[1] ?? 0)];
        const precedent = points.at(-1);
        if (!precedent || precedent[0] !== p[0] || precedent[1] !== p[1]) points.push(p);
      }
      const premier = points[0];
      const dernier = points.at(-1);
      if (premier && dernier && (premier[0] !== dernier[0] || premier[1] !== dernier[1])) points.push([...premier]);
      if (points.length >= 4) anneaux.push(points);
      else if (index === 0) break; // contour extérieur effondré : on abandonne le polygone (îlot minuscule)
    }
    if (anneaux.length > 0) resultat.push(anneaux);
  }
  return resultat.length > 0 ? versSurface(resultat) : geometrie;
}

/** Simplifie (Douglas-Peucker) puis arrondit. */
export function simplifier(geometrie: Surface, tolerance: number, decimales: number): Surface {
  const simple = simplify(geometrie, { tolerance, highQuality: false, mutate: false });
  return arrondir(simple, decimales);
}

export function nombreDePoints(geometrie: Surface): number {
  let n = 0;
  for (const polygone of polygones(geometrie)) for (const anneau of polygone) n += anneau.length;
  return n;
}

export function boite(geometrie: Surface): Boite {
  let ouest = Number.POSITIVE_INFINITY;
  let sud = Number.POSITIVE_INFINITY;
  let est = Number.NEGATIVE_INFINITY;
  let nord = Number.NEGATIVE_INFINITY;
  for (const polygone of polygones(geometrie)) {
    for (const [lng = 0, lat = 0] of polygone[0] ?? []) {
      if (lng < ouest) ouest = lng;
      if (lng > est) est = lng;
      if (lat < sud) sud = lat;
      if (lat > nord) nord = lat;
    }
  }
  return [ouest, sud, est, nord];
}

/** Aire plane signée-absolue d'un anneau (formule du lacet), en degrés². */
function aireAnneau(anneau: Position[]): number {
  let somme = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const a = anneau[j] as Position;
    const b = anneau[i] as Position;
    somme += ((a[0] ?? 0) - (b[0] ?? 0)) * ((a[1] ?? 0) + (b[1] ?? 0));
  }
  return Math.abs(somme / 2);
}

function airePolygone(polygone: Position[][]): number {
  const [exterieur, ...trous] = polygone;
  return aireAnneau(exterieur ?? []) - trous.reduce((total, trou) => total + aireAnneau(trou), 0);
}

/**
 * Point d'ancrage de la commune (marqueur, étiquette) : pôle d'inaccessibilité du plus grand
 * morceau, donc toujours à l'intérieur, même pour une commune en croissant ou en archipel.
 */
export function centre(geometrie: Surface): { lat: number; lng: number } {
  const liste = polygones(geometrie);
  let plusGrand = liste[0] ?? [];
  let aireMax = -1;
  for (const polygone of liste) {
    const aire = airePolygone(polygone);
    if (aire > aireMax) {
      aireMax = aire;
      plusGrand = polygone;
    }
  }
  const [lng = 0, lat = 0] = polylabel(plusGrand, 0.0001);
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
