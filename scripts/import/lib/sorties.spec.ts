import { describe, expect, it } from 'vitest';
import type { Boite } from './geometrie.ts';
import { fichierZones, unirBoites, zoomPourBoite } from './sorties.ts';

describe('sorties de l’import', () => {
  it('agrandit une boîte', () => {
    expect(unirBoites(undefined, [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(unirBoites([1, 2, 3, 4], [0, 3, 5, 3.5])).toEqual([0, 2, 5, 4]);
  });

  it('conseille un zoom adapté à chaque zone', () => {
    expect(zoomPourBoite([-5.15, 41.33, 9.57, 51.09])).toBe(6); // Métropole
    expect(zoomPourBoite([-61.23, 14.38, -60.8, 14.88])).toBe(10); // Martinique
    expect(zoomPourBoite([-62.88, 17.87, -62.78, 17.93])).toBe(13); // Saint-Barthélemy, plafonné
  });

  it('écrit shared/src/zones.generees.ts', () => {
    const boites = new Map<string, Boite>(
      ['MET', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'WF', 'PF', 'NC'].map((code) => [code, [0, 0, 1, 1]]),
    );
    boites.set('MQ', [-61.2296, 14.3884, -60.8096, 14.8785]);

    const contenu = fichierZones(boites as never, [8.53, 41.33, 9.56, 43.03]);

    expect(contenu).toContain('MQ: { bbox: [-61.23,14.388,-60.809,14.879], zoom: 10 },');
    expect(contenu).toContain('export const BOITE_CORSE');
    expect(contenu).toContain('Ne pas modifier à la main');
  });

  it('refuse une zone sans commune', () => {
    expect(() => fichierZones(new Map(), [0, 0, 1, 1])).toThrow(/MET/);
  });
});
