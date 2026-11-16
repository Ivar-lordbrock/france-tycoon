import { describe, expect, it } from 'vitest';
import { estRejet, type TerritoireImporte, versTerritoire } from './communes.ts';
import { carre, commune } from './fixtures.ts';

describe('commune de l’API Geo → territoire', () => {
  it('calcule zone, V0 (I = 0), emplacements, surface en km² et contours', () => {
    const t = versTerritoire(commune({ population: 173_089, surface: 7997 })) as TerritoireImporte;

    expect(estRejet(t)).toBe(false);
    expect(t).toMatchObject({
      insee: '42218',
      nom: 'Saint-Étienne',
      departement: '42',
      region: '84',
      typeRegion: 'metropole',
      zone: 'MET',
      population: 173_089,
      surfaceKm2: 79.97,
      infra: 0,
      valeurBase: 1_557_400, // arrondi_100(3 000 + 30 × 173 089^0,9)
      emplacements: 12,
      balanceVersion: 1,
      boite: [4.35, 45.4, 4.43, 45.48],
    });
    expect(t.centre.lat).toBeCloseTo(45.44, 2);
    expect(t.centre.lng).toBeCloseTo(4.39, 2);
    expect(JSON.parse(t.contourLow).type).toBe('Polygon');
    expect(JSON.parse(t.contourHigh).type).toBe('Polygon');
  });

  it('tient compte des équipements déjà importés', () => {
    const sans = versTerritoire(commune({ population: 859 })) as TerritoireImporte;
    const avec = versTerritoire(commune({ population: 859 }), { commerce: { bpe: 7 } }) as TerritoireImporte;
    expect(sans.valeurBase).toBe(16_100);
    expect(avec.infra).toBe(7);
    expect(avec.valeurBase).toBe(21_800); // exemple de docs/05-equilibrage.md
  });

  it('range l’Outre-mer dans sa zone', () => {
    const t = versTerritoire(
      commune(
        { code: '97209', nom: 'Fort-de-France', codeDepartement: '972', codeRegion: '02' },
        carre(-61.1, 14.6, 0.05),
      ),
    ) as TerritoireImporte;
    expect(t.zone).toBe('MQ');
    expect(t.typeRegion).toBe('outre_mer');
    expect(t.population).toBe(0);
    expect(t.valeurBase).toBe(3_000);
    expect(t.emplacements).toBe(3);
  });

  it.each([
    [{ code: '98411', codeDepartement: '984' }, carre(69, -49, 0.1), /hors des 12 zones/],
    [{ code: '42218' }, null, /pas de contour/],
    [{ code: '4221' }, carre(4, 45, 0.1), /code INSEE invalide/],
  ])('rejette %o', (proprietes, geometrie, raison) => {
    const resultat = versTerritoire(commune(proprietes, geometrie));
    expect(estRejet(resultat)).toBe(true);
    expect((resultat as { raison: string }).raison).toMatch(raison);
  });
});
