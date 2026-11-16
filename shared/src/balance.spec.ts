import { describe, expect, it } from 'vitest';
import { emplacements, facteurTaille, scoreInfra, valeurBase } from './balance.ts';

// Tableau « Exemples » de docs/05-equilibrage.md, section 5.1.
const exemples = [
  { commune: "L'Abergement-Clémenciat", population: 859, infra: 7, v0: 21_800, fT: 1.5, empl: 7 },
  { commune: 'Saint-Véran', population: 160, infra: 57, v0: 36_400, fT: 1.9, empl: 6 },
  { commune: 'Le Mont-Saint-Michel', population: 23, infra: 221, v0: 93_600, fT: 3.1, empl: 4 },
  { commune: 'Pointe-à-Pitre', population: 15_040, infra: 1_702, v0: 636_700, fT: 8.0, empl: 10 },
  { commune: 'Papeete', population: 26_654, infra: 1_816, v0: 777_400, fT: 8.8, empl: 10 },
  { commune: 'Annecy', population: 132_117, infra: 4_870, v0: 2_291_500, fT: 15.1, empl: 12 },
  { commune: 'Lyon', population: 519_127, infra: 35_740, v0: 9_448_700, fT: 30.7, empl: 13 },
  { commune: 'Paris', population: 2_103_778, infra: 191_340, v0: 34_886_300, fT: 59.1, empl: 14 },
];

describe('valeur d’une commune (5.1)', () => {
  it.each(exemples)('$commune : V0 = $v0, f_T ≈ $fT, $empl emplacements', ({ population, infra, v0, fT, empl }) => {
    expect(valeurBase(population, infra)).toBe(v0);
    expect(facteurTaille(v0)).toBeCloseTo(fT, 1);
    expect(emplacements(population)).toBe(empl);
  });

  it('commune sans habitant ni équipement : 3 000 ₮ et 3 emplacements', () => {
    expect(valeurBase(0, 0)).toBe(3_000);
    expect(emplacements(0)).toBe(3);
    expect(facteurTaille(3_000)).toBe(1);
  });

  it('V0 est un entier multiple de 100, même avec I = 0 (avant import BPE/OSM)', () => {
    for (const population of [1, 42, 999, 12_345, 870_000]) {
      const v0 = valeurBase(population, 0);
      expect(Number.isInteger(v0)).toBe(true);
      expect(v0 % 100).toBe(0);
    }
  });

  it('plafonne les emplacements à 16 et le facteur de taille à 60', () => {
    expect(emplacements(1e12)).toBe(16);
    expect(facteurTaille(1e12)).toBe(60);
  });
});

describe('score d’infrastructures', () => {
  it('vaut 0 sans données', () => {
    expect(scoreInfra({})).toBe(0);
  });

  it('prend la BPE en priorité, OSM sinon, et OSM seulement pour gares, aéroports, ports, monuments, musées', () => {
    const i = scoreInfra({
      commerce: { bpe: 10, osm: 3 }, // 10 × 1 (BPE prioritaire)
      sante: { osm: 2 }, // 2 × 2 (pas de BPE : COM)
      gare: { bpe: 5, osm: 1 }, // 1 × 40 (toujours OSM)
      monument: { bpe: 4 }, // 0 (pas d'OSM)
    });
    expect(i).toBe(10 + 4 + 40);
  });
});
