import {
  bonusNiveau,
  catalogueBatimentsSchema,
  coutNiveau,
  dureeChantier,
  facteurTaille,
  NIVEAU_MAX_BATIMENT,
  revenuNiveau,
  type TypeBatiment,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest } from '../../outils-test/base.ts';

const NIVEAUX = [1, 2, 3, 4, 5];
const heures = (h: number) => h * 3_600;

async function lireCatalogue() {
  const reponse = await appDeTest().inject({ method: 'GET', url: '/api/v1/building-types' });
  expect(reponse.statusCode).toBe(200);
  const { buildingTypes } = catalogueBatimentsSchema.parse(reponse.json());
  const parCode = (code: string): TypeBatiment => {
    const type = buildingTypes.find((t) => t.code === code);
    if (!type) throw new Error(`type ${code} absent du catalogue`);
    return type;
  };
  return { reponse, buildingTypes, parCode };
}

describe('GET /api/v1/building-types', () => {
  it('7 bâtiments, siège social en dernier, mis en cache par le navigateur', async () => {
    const { reponse, buildingTypes } = await lireCatalogue();

    expect(buildingTypes.map((t) => t.code)).toEqual([
      'residence',
      'commerce',
      'usine',
      'bureaux',
      'equipement',
      'gare',
      'siege_social',
    ]);
    expect(buildingTypes.every((t) => t.maxLevel === NIVEAU_MAX_BATIMENT)).toBe(true);
    expect(reponse.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('Résidence au village : le tableau d’exemple de docs/05 (5.2)', async () => {
    const { parCode } = await lireCatalogue();
    const residence = parCode('residence');
    const fTVillage = facteurTaille(21_800);

    expect(NIVEAUX.map((l) => coutNiveau(residence, l, fTVillage))).toEqual([4_430, 8_860, 17_720, 35_440, 70_870]);
    expect(NIVEAUX.map((l) => revenuNiveau(residence, l, fTVillage))).toEqual([295, 502, 853, 1_451, 2_466]);
    expect(NIVEAUX.map((l) => dureeChantier(residence, l))).toEqual([600, 1_200, 2_400, 4_800, 9_600]);
  });

  it('durées du niveau 1 au niveau 5, comme dans le tableau de docs/05', async () => {
    const { parCode } = await lireCatalogue();
    const duree = (code: string) => [dureeChantier(parCode(code), 1), dureeChantier(parCode(code), 5)];

    expect(duree('commerce')).toEqual([1_200, heures(5) + 1_200]); // 20 min → 5 h 20
    expect(duree('usine')).toEqual([heures(1), heures(16)]);
    expect(duree('bureaux')).toEqual([heures(2), heures(32)]);
    expect(duree('equipement')).toEqual([1_800, heures(8)]);
    expect(duree('gare')).toEqual([heures(3), heures(48)]);
    expect(duree('siege_social')).toEqual([heures(1), heures(16)]);
  });

  it('gare : 2 emplacements, 2 000 habitants, une par commune, +10 % par niveau', async () => {
    const { parCode } = await lireCatalogue();
    const gare = parCode('gare');

    expect(gare).toMatchObject({
      category: 'infrastructure',
      baseCost: 20_000,
      baseIncomePerHour: 0,
      slotSize: 2,
      minPopulation: 2_000,
      maxPerTerritory: 1,
      maxPerUser: null,
      scalesWithTerritory: true,
    });
    expect(NIVEAUX.map((l) => bonusNiveau(gare, l))).toEqual([10, 20, 30, 40, 50]);
    expect(bonusNiveau(parCode('equipement'), 5)).toBe(40);
  });

  it('siège social : 40 000 × 2,5 par niveau, quelle que soit la commune', async () => {
    const { parCode } = await lireCatalogue();
    const siege = parCode('siege_social');

    expect(NIVEAUX.map((l) => coutNiveau(siege, l, 3))).toEqual([40_000, 100_000, 250_000, 625_000, 1_562_500]);
    expect(siege).toMatchObject({ territorySlotBonus: 1, maxPerUser: 1, scalesWithTerritory: false });
  });

  it('un type désactivé n’apparaît plus', async () => {
    const app = appDeTest();
    app.db.exec("UPDATE building_types SET is_active = 0 WHERE code = 'gare'");

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/building-types' });

    expect(reponse.json().buildingTypes.map((t: TypeBatiment) => t.code)).not.toContain('gare');
  });
});
