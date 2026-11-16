import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { anneauxDuMasque } from './masque.ts';

describe('masque gris hors de France', () => {
  it('perce le monde avec chaque anneau des zones, en [lat, lng]', () => {
    const zones: FeatureCollection<Polygon | MultiPolygon> = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 40],
                [10, 40],
                [10, 50],
                [0, 50],
                [0, 40],
              ],
              [
                [1.9, 42.4],
                [2, 42.4],
                [2, 42.5],
                [1.9, 42.4],
              ], // enclave
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-61, 14],
                  [-60, 14],
                  [-60, 15],
                  [-61, 14],
                ],
              ],
            ],
          },
        },
      ],
    };

    const anneaux = anneauxDuMasque(zones);

    expect(anneaux).toHaveLength(4);
    expect(anneaux[0]?.[1]).toEqual([-85, 180]);
    expect(anneaux[1]?.[1]).toEqual([40, 10]);
    expect(anneaux[3]?.[0]).toEqual([14, -61]);
  });
});
