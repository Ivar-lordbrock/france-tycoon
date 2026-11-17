import type { TypeBatiment } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import {
  apercuAmelioration,
  apercuConstruction,
  apercuDemolition,
  avancement,
  type Contexte,
  cashEnDirect,
  effet,
  minuteur,
  phraseChantierFini,
  prochaineRelecture,
  titreResume,
  variation,
} from './batiments-texte.ts';

// Village 01001 (docs/05, 5.2) : V0 = 21 800 ₮ (f_T ≈ 1,48), sol 218 ₮/h, 859 habitants, 3 emplacements.
// Résidence : 4 430 ₮ puis 8 860 ₮ ; 295 ₮/h puis 502 ₮/h ; 10 min puis 20 min.
const type = (t: Partial<TypeBatiment> & Pick<TypeBatiment, 'code' | 'name'>): TypeBatiment => ({
  category: 'logement',
  description: null,
  baseCost: 3_000,
  costGrowth: 2,
  baseIncomePerHour: 0,
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
  ...t,
});
const residence = type({ code: 'residence', name: 'Résidence', baseIncomePerHour: 200 });
const usine = type({
  code: 'usine',
  name: 'Usine',
  baseCost: 15_000,
  baseIncomePerHour: 900,
  slotSize: 2,
  maxPerTerritory: 2,
  minPopulation: 1_000,
});
const equipement = type({
  code: 'equipement',
  name: 'Équipement public',
  baseCost: 8_000,
  incomeBonusPct: 8,
  maxPerTerritory: 1,
});
const siege = type({
  code: 'siege_social',
  name: 'Siège social',
  category: 'siege',
  baseCost: 40_000,
  costGrowth: 2.5,
  territorySlotBonus: 1,
  baseBuildSeconds: 3_600,
  slotSize: 2,
  maxPerTerritory: 1,
  maxPerUser: 1,
  scalesWithTerritory: false,
});
const catalogue = [residence, usine, equipement, siege];

const batiment = (id: number, typeCode: string, level: number) => ({
  id,
  typeCode,
  name: typeCode,
  level,
  targetLevel: null,
  worksEndsAt: null,
});

const contexte = (c: Partial<Contexte> & { batiments?: ReturnType<typeof batiment>[] } = {}): Contexte => {
  const batiments = c.batiments ?? [];
  return {
    fiche: {
      baseValue: 21_800,
      population: 859,
      buildingSlots: { total: 3, used: batiments.length },
      buildings: batiments,
    },
    catalogue,
    cash: 30_000,
    aUnSiege: false,
    ...c,
  };
};
const espace = /\s/g; // Intl sépare les milliers par une espace fine insécable
const net = (texte: string | null) => texte?.replace(espace, ' ');

describe('argent qui monte et minuteurs', () => {
  it('le cash monte de revenu/h ÷ 3 600 chaque seconde, plafonné à 48 h', () => {
    expect(cashEnDirect(1_000, 3_600, 10_000)).toBe(1_010);
    expect(cashEnDirect(1_000, 513, 60_000)).toBe(1_008); // 8,55 ₮ : on n'affiche que les ₮ entiers
    expect(cashEnDirect(1_000, 3_600, -5_000)).toBe(1_000);
    expect(cashEnDirect(0, 100, 100 * 3_600_000)).toBe(4_800);
  });

  it('écrit le temps restant à la seconde sous l’heure', () => {
    expect(minuteur(45)).toBe('45 s');
    expect(minuteur(0.2)).toBe('1 s');
    expect(minuteur(485)).toBe('8 min 05 s');
    expect(minuteur(9_600)).toBe('2 h 40');
    expect(minuteur(-3)).toBe('0 s');
  });

  it('calcule l’avancement d’un chantier', () => {
    expect(avancement(100, 200, 150)).toBe(0.5);
    expect(avancement(100, 200, 50)).toBe(0);
    expect(avancement(100, 200, 500)).toBe(1);
    expect(avancement(100, 100, 100)).toBe(1);
  });

  it('relit la file juste après la fin du prochain chantier, pas plus d’une fois toutes les 2 s', () => {
    const chantier = (endsAt: number) => ({
      buildingId: 1,
      territoryInsee: '01001',
      territoryName: 'X',
      typeCode: 'residence',
      name: 'Résidence',
      targetLevel: 1,
      startedAt: 0,
      endsAt,
      cost: 4_430,
    });
    expect(prochaineRelecture(undefined, 0)).toBe(false);
    expect(prochaineRelecture({ slots: 1, works: [] }, 0)).toBe(false);
    expect(prochaineRelecture({ slots: 2, works: [chantier(50), chantier(10)] }, 0)).toBe(11_000);
    expect(prochaineRelecture({ slots: 1, works: [chantier(10)] }, 30_000)).toBe(2_000);
  });
});

describe('aperçus des chantiers (mêmes formules que le serveur)', () => {
  it('dit ce que fait un bâtiment à un niveau', () => {
    const fT = Math.sqrt(2.18);
    expect(net(effet(residence, 1, fT))).toBe('295 ₮/h');
    expect(effet(equipement, 2, fT)).toBe('+16 % sur la commune');
    expect(effet(siege, 1, fT)).toBe('+1 territoire max');
    expect(effet(siege, 3, fT)).toBe('+3 territoires max');
    expect(effet(residence, 0, fT)).toBe('Rien encore');
  });

  it('construire une Résidence au village : prix, durée, revenu de la commune', () => {
    expect(apercuConstruction(residence, contexte())).toEqual({
      cout: 4_430,
      resteCash: 25_570,
      duree: 600,
      revenu: { avant: 218, apres: 513 },
      raison: null,
    });
    expect(net(apercuConstruction(residence, contexte({ cash: 1_000 })).raison)).toBe('Il te manque 3 430 ₮.');
  });

  it('le bonus d’un équipement public s’applique à toute la commune', () => {
    const ctx = contexte({ batiments: [batiment(1, 'residence', 1)] });
    expect(apercuConstruction(equipement, ctx).revenu).toEqual({ avant: 513, apres: 554 }); // 513 × 1,08
  });

  it('explique pourquoi on ne peut pas construire', () => {
    expect(net(apercuConstruction(usine, contexte()).raison)).toBe('Il faut 1 000 habitants.');
    const avecEquipement = contexte({ batiments: [batiment(1, 'equipement', 1)] });
    expect(apercuConstruction(equipement, avecEquipement).raison).toBe('Déjà construit ici.');
    expect(apercuConstruction(siege, contexte({ aUnSiege: true })).raison).toBe('Tu as déjà un siège social.');
    const deuxPris = contexte({ batiments: [batiment(1, 'residence', 1), batiment(2, 'residence', 1)] });
    expect(apercuConstruction(siege, deuxPris).raison).toBe('Il faut 2 emplacements, il en reste 1.');
    const plein = contexte({ batiments: [1, 2, 3].map((id) => batiment(id, 'residence', 1)) });
    expect(apercuConstruction(residence, plein).raison).toBe('Plus d’emplacement libre ici.');
  });

  it('le siège social ne dépend pas de la taille de la commune', () => {
    const a = apercuConstruction(siege, contexte({ cash: 50_000 }));
    expect(a.cout).toBe(40_000);
    expect(a.duree).toBe(3_600);
  });

  it('améliorer une Résidence : prix du niveau 2, durée doublée, revenu 295 → 502', () => {
    const residence1 = batiment(1, 'residence', 1);
    expect(apercuAmelioration(residence, residence1, contexte({ batiments: [residence1] }))).toEqual({
      cout: 8_860,
      resteCash: 21_140,
      duree: 1_200,
      revenu: { avant: 513, apres: 720 },
      raison: null,
    });
    const residence5 = batiment(1, 'residence', 5);
    expect(apercuAmelioration(residence, residence5, contexte({ batiments: [residence5] })).raison).toBe(
      'Niveau maximum.',
    );
  });

  it('démolir rend 30 % du prix de ses niveaux', () => {
    const residence2 = batiment(1, 'residence', 2);
    expect(apercuDemolition(residence, residence2, contexte({ batiments: [residence2] }))).toEqual({
      rembourse: 3_987, // 30 % de 4 430 + 8 860
      revenu: { avant: 720, apres: 218 },
    });
  });

  it('écrit la variation du revenu', () => {
    expect(net(variation({ avant: 513, apres: 513 }))).toBe('513 ₮/h');
    expect(net(variation({ avant: 513, apres: 720 }))).toBe('513 ₮/h → 720 ₮/h');
  });
});

describe('résumé au retour', () => {
  it('« Pendant ton absence » si un chantier a fini avant l’ouverture de la page', () => {
    expect(titreResume([{ finishedAt: 90 }, { finishedAt: 120 }], 100)).toBe('Pendant ton absence');
    expect(titreResume([{ finishedAt: 120 }], 100)).toBe('Chantier terminé');
    expect(titreResume([{ finishedAt: 120 }, { finishedAt: 130 }], 100)).toBe('Chantiers terminés');
  });

  it('dit ce qui a changé, sans accord (le nom peut être féminin)', () => {
    const fini = { name: 'Résidence', territoryName: 'L’Abergement-Clémenciat' };
    expect(phraseChantierFini({ ...fini, level: 1 })).toBe(
      'Résidence à L’Abergement-Clémenciat : construction terminée.',
    );
    expect(phraseChantierFini({ ...fini, level: 3 })).toBe('Résidence à L’Abergement-Clémenciat : niveau 3 atteint.');
  });
});
