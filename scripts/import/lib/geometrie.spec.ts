import type { Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { arrondir, boite, centre, nombreDePoints, simplifier } from './geometrie.ts';

/** Cercle très détaillé (1 000 points) autour de (lng, lat). */
function cercle(lng: number, lat: number, rayon: number, points = 1000): Polygon {
  const anneau = Array.from({ length: points }, (_, i) => {
    const a = (2 * Math.PI * i) / points;
    return [lng + rayon * Math.cos(a), lat + rayon * Math.sin(a)];
  });
  anneau.push([...(anneau[0] as number[])]);
  return { type: 'Polygon', coordinates: [anneau] };
}

describe('géométrie des contours', () => {
  it('simplifie fortement sans perdre la forme', () => {
    const detail = cercle(4.39, 45.43, 0.05);
    const low = simplifier(detail, 0.001, 4);
    const high = simplifier(detail, 0.0002, 5);

    expect(nombreDePoints(low)).toBeLessThan(40);
    expect(nombreDePoints(high)).toBeLessThan(nombreDePoints(detail) / 5);
    expect(nombreDePoints(high)).toBeGreaterThan(nombreDePoints(low));
    const [ouest, sud, est, nord] = boite(low);
    expect(est - ouest).toBeCloseTo(0.1, 2);
    expect(nord - sud).toBeCloseTo(0.1, 2);
  });

  it('arrondit, retire les points répétés et les îlots devenus trop petits', () => {
    const resultat = arrondir(
      {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0.123456, 0.1],
              [0.123457, 0.1],
              [1.2, 0.1],
              [1.2, 1.2],
              [0.123456, 0.1],
            ],
          ],
          [
            [
              [5.00001, 5.00001],
              [5.00002, 5.00001],
              [5.00002, 5.00002],
              [5.00001, 5.00001],
            ],
          ],
        ],
      },
      3,
    );
    expect(resultat).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0.123, 0.1],
          [1.2, 0.1],
          [1.2, 1.2],
          [0.123, 0.1],
        ],
      ],
    });
  });

  it('place le centre à l’intérieur d’une commune en forme de U', () => {
    // U : le centre de la boîte (0,5 ; 0,5) tombe dans le creux, hors de la commune.
    const u: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0.8, 1],
          [0.8, 0.2],
          [0.2, 0.2],
          [0.2, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    const { lat, lng } = centre(u);
    const dansLeCreux = lng > 0.2 && lng < 0.8 && lat > 0.2;
    expect(dansLeCreux).toBe(false);
    expect(lng).toBeGreaterThanOrEqual(0);
    expect(lng).toBeLessThanOrEqual(1);
  });

  it('choisit le plus grand morceau d’un archipel pour le centre', () => {
    const petit = cercle(-61.0, 14.5, 0.01, 50).coordinates;
    const grand = cercle(-61.1, 14.7, 0.1, 50).coordinates;
    const { lat, lng } = centre({ type: 'MultiPolygon', coordinates: [petit, grand] });
    expect(lng).toBeCloseTo(-61.1, 1);
    expect(lat).toBeCloseTo(14.7, 1);
  });
});
