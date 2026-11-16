import type { MultiPolygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { contoursAlleges, fusionner } from './contours.ts';
import { carre } from './fixtures.ts';
import type { Surface } from './geometrie.ts';

const anneaux = (g: Surface) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

describe('contours des départements et des zones', () => {
  it('fusionne deux communes voisines en un seul contour, sans fente', () => {
    const fusion = fusionner([carre(0, 0, 1), carre(1, 0, 1)]);
    expect(fusion.coordinates).toHaveLength(1);
    expect(fusion.coordinates[0]).toHaveLength(1); // pas de trou
    const xs = (fusion.coordinates[0]?.[0] ?? []).map((p) => p[0]);
    expect(Math.min(...(xs as number[]))).toBe(0);
    expect(Math.max(...(xs as number[]))).toBe(2);
  });

  it('garde les îles séparées', () => {
    const fusion: MultiPolygon = fusionner([carre(0, 0, 1), carre(5, 5, 1)]);
    expect(fusion.coordinates).toHaveLength(2);
  });

  it('allège les départements et produit le contour de chaque zone', () => {
    const { departements, zones } = contoursAlleges(
      [
        { code: '42', nom: 'Loire', zone: 'MET', geometrie: carre(4, 45, 1) },
        { code: '43', nom: 'Haute-Loire', zone: 'MET', geometrie: carre(4, 44, 1) },
        { code: '972', nom: 'Martinique', zone: 'MQ', geometrie: carre(-61.2, 14.4, 0.4) },
      ],
      { poidsMin: 1e-6, decimales: 3 },
    );

    expect(departements.features.map((f) => f.properties.code)).toEqual(['42', '43', '972']);
    expect(zones.features.map((f) => f.properties.zone).sort()).toEqual(['MET', 'MQ']);
    const metropole = zones.features.find((f) => f.properties.zone === 'MET');
    expect(anneaux(metropole?.geometry as Surface)).toHaveLength(1); // Loire + Haute-Loire = un seul bloc
  });
});
