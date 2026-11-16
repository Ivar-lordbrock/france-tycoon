import type { Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { silhouette } from './silhouette.ts';

const carre = (ouest: number, sud: number, cote: number): Polygon => ({
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
});

describe('silhouette des zones', () => {
  it('centre le territoire dans le carré, nord en haut', () => {
    expect(silhouette([carre(0, 0, 1)], 32, 2)).toBe('M2 30L30 30L30 2L2 2L2 30Z');
  });

  it('garde les proportions (un territoire large reste large)', () => {
    const chemin = silhouette([carre(0, 0, 2), carre(3, 0, 1)], 32, 2);
    expect(chemin.match(/M/g)).toHaveLength(2);
    expect(chemin.startsWith('M2 ')).toBe(true);
  });

  it('renvoie un chemin vide sans géométrie', () => {
    expect(silhouette([])).toBe('');
  });
});
