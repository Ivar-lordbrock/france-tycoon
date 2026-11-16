import type { MultiPolygon, Polygon, Position } from 'geojson';

/**
 * Silhouette d'un territoire en chemin SVG, centrée dans un carré `taille × taille`
 * (projection équirectangulaire corrigée par cos(latitude), suffisante à cette échelle).
 */
export function silhouette(geometries: (Polygon | MultiPolygon)[], taille = 32, marge = 2): string {
  const anneaux: Position[][] = [];
  for (const g of geometries) {
    const polygones = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const polygone of polygones) if (polygone[0]) anneaux.push(polygone[0]); // les trous ne se voient pas
  }
  const points = anneaux.flat();
  if (points.length === 0) return '';

  const lats = points.map((p) => p[1] ?? 0);
  const latMoyenne = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((latMoyenne * Math.PI) / 180);
  const projete = (p: Position): [number, number] => [(p[0] ?? 0) * kx, -(p[1] ?? 0)];

  const xs = points.map((p) => projete(p)[0]);
  const ys = points.map((p) => projete(p)[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const echelle = (taille - 2 * marge) / Math.max(maxX - minX, maxY - minY, 1e-9);
  const decalageX = (taille - (maxX - minX) * echelle) / 2;
  const decalageY = (taille - (maxY - minY) * echelle) / 2;
  const arrondi = (v: number) => Math.round(v * 10) / 10;

  return anneaux
    .map((anneau) => {
      const sommets: string[] = [];
      let precedent: [number, number] | undefined;
      for (const p of anneau) {
        const [x, y] = projete(p);
        const point: [number, number] = [
          arrondi((x - minX) * echelle + decalageX),
          arrondi((y - minY) * echelle + decalageY),
        ];
        // Un point à moins d'un demi-pixel du précédent n'apporte rien à cette taille.
        if (precedent && Math.abs(point[0] - precedent[0]) + Math.abs(point[1] - precedent[1]) < 0.5) continue;
        sommets.push(`${point[0]} ${point[1]}`);
        precedent = point;
      }
      return sommets.length > 0 ? `M${sommets.join('L')}Z` : '';
    })
    .join('');
}
