import { describe, expect, it } from 'vitest';
import { coutNiveau, dureeChantier, facteurTaille, NIVEAU_MAX_BATIMENT } from '../balance.ts';
import { batimentParamsSchema, construireCorpsSchema, type TypeBatiment, typeBatimentSchema } from './economie.ts';

const residence: TypeBatiment = {
  code: 'residence',
  name: 'Résidence',
  category: 'logement',
  description: null,
  baseCost: 3_000,
  costGrowth: 2,
  baseIncomePerHour: 200,
  incomeGrowth: 1.7,
  incomeBonusPct: 0,
  territorySlotBonus: 0,
  baseBuildSeconds: 600,
  timeGrowth: 2,
  maxLevel: 5,
  slotSize: 1,
  maxPerTerritory: null,
  maxPerUser: null,
  minPopulation: 0,
  scalesWithTerritory: true,
};

describe('contrat des routes de l’étape 3', () => {
  it('une entrée du catalogue sert directement aux formules d’aperçu', () => {
    const type = typeBatimentSchema.parse(residence);
    expect(coutNiveau(type, 1, facteurTaille(21_800))).toBe(4_430);
    expect(dureeChantier(type, 5)).toBe(9_600);
  });

  it('refuse un type de bâtiment au-delà du niveau 5', () => {
    expect(typeBatimentSchema.safeParse({ ...residence, maxLevel: NIVEAU_MAX_BATIMENT + 1 }).success).toBe(false);
  });

  it('lit l’identifiant d’un bâtiment depuis l’URL', () => {
    expect(batimentParamsSchema.parse({ id: '42' })).toEqual({ id: 42 });
    expect(batimentParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(batimentParamsSchema.safeParse({ id: '0' }).success).toBe(false);
  });

  it('exige un code de bâtiment pour construire', () => {
    expect(construireCorpsSchema.safeParse({ typeCode: '' }).success).toBe(false);
    expect(construireCorpsSchema.parse({ typeCode: 'gare' })).toEqual({ typeCode: 'gare' });
  });
});
