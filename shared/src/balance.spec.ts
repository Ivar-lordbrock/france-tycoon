import { describe, expect, it } from 'vitest';
import {
  apportBatiment,
  bonusNiveau,
  bonusTerritoiresRang,
  CAPITAL_DEPART,
  coutNiveau,
  DELAI_DEPLACEMENT_CAPITALE_S,
  dureeChantier,
  emplacements,
  FILES_CONSTRUCTION_DEPART,
  facteurTaille,
  gainParMorceaux,
  maxTerritoires,
  NIVEAU_MAX_BATIMENT,
  type ParametresBatiment,
  PLAFOND_HORS_LIGNE_S,
  partagerCumul,
  prixVenteEtat,
  RANGS,
  remboursementDemolition,
  revenuCumule,
  revenuJoueur,
  revenuNiveau,
  revenuSol,
  revenuTerritoire,
  scoreInfra,
  TERRITOIRES_DEPART,
  valeurBase,
  valeurTerritoire,
} from './balance.ts';

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

describe('revenu du sol et valeur d’un territoire (5.3, 5.4)', () => {
  it('R_sol = 1 % de V0, arrondi (colonne « Revenu du sol /h » de 5.1)', () => {
    expect(revenuSol(21_800)).toBe(218);
    expect(revenuSol(93_600)).toBe(936);
    expect(revenuSol(34_886_300)).toBe(348_863);
  });

  it('V_T = V0 + B + F', () => {
    expect(valeurTerritoire(21_800, 4_430, 0)).toBe(26_230);
    expect(valeurTerritoire(21_800, 0, 10_500)).toBe(32_300);
  });

  it('capital de départ : 50 000 ₮, L’Abergement-Clémenciat et de quoi le bâtir', () => {
    expect(CAPITAL_DEPART).toBe(50_000);
    expect(CAPITAL_DEPART).toBeGreaterThan(valeurBase(859, 7));
  });
});

// Paramètres du tableau de docs/05-equilibrage.md, section 5.2 (ceux de la table `building_types`).
const residence: ParametresBatiment = {
  baseCost: 3_000,
  costGrowth: 2,
  baseIncomePerHour: 200,
  incomeGrowth: 1.7,
  incomeBonusPct: 0,
  baseBuildSeconds: 10 * 60,
  timeGrowth: 2,
  scalesWithTerritory: true,
};
const gare: ParametresBatiment = {
  ...residence,
  baseCost: 20_000,
  baseIncomePerHour: 0,
  incomeBonusPct: 10,
  baseBuildSeconds: 3 * 3_600,
};
const siege: ParametresBatiment = {
  ...residence,
  baseCost: 40_000,
  costGrowth: 2.5,
  baseIncomePerHour: 0,
  baseBuildSeconds: 3_600,
  scalesWithTerritory: false,
};
const NIVEAUX = [1, 2, 3, 4, 5];
const fTVillage = facteurTaille(21_800); // L'Abergement-Clémenciat, f_T ≈ 1,48

describe('bâtiments (5.2)', () => {
  it('niveau 5 au maximum', () => {
    expect(NIVEAU_MAX_BATIMENT).toBe(5);
  });

  it('Résidence au village : coût ×2 et revenu +70 % par niveau (exemple de 5.2)', () => {
    expect(NIVEAUX.map((l) => coutNiveau(residence, l, fTVillage))).toEqual([4_430, 8_860, 17_720, 35_440, 70_870]);
    expect(NIVEAUX.map((l) => revenuNiveau(residence, l, fTVillage))).toEqual([295, 502, 853, 1_451, 2_466]);
  });

  it('un bâtiment en première construction (niveau 0) ne rapporte rien', () => {
    expect(revenuNiveau(residence, 0, fTVillage)).toBe(0);
    expect(bonusNiveau(gare, 0)).toBe(0);
  });

  it('chantiers ×2 par niveau : Résidence 10 min → 2 h 40, gare 3 h → 48 h, siège 1 h → 16 h', () => {
    expect(NIVEAUX.map((l) => dureeChantier(residence, l))).toEqual([600, 1_200, 2_400, 4_800, 9_600]);
    expect(dureeChantier(gare, 1)).toBe(3 * 3_600);
    expect(dureeChantier(gare, 5)).toBe(48 * 3_600);
    expect(dureeChantier(siege, 5)).toBe(16 * 3_600);
  });

  it('siège social : 40 000 × 2,5^(L−1), sans facteur de taille', () => {
    const coutsVillage = NIVEAUX.map((l) => coutNiveau(siege, l, fTVillage));
    expect(coutsVillage).toEqual([40_000, 100_000, 250_000, 625_000, 1_562_500]);
    expect(NIVEAUX.map((l) => coutNiveau(siege, l, 59))).toEqual(coutsVillage);
  });

  it('gare : +10 % par niveau sur le territoire, +50 % au niveau 5', () => {
    expect(NIVEAUX.map((l) => bonusNiveau(gare, l))).toEqual([10, 20, 30, 40, 50]);
  });

  it('temps de retour marginal de la Résidence : 15 h, 43 h, 50 h, 59 h, 70 h (toujours croissant)', () => {
    const retours = NIVEAUX.map((l) => {
      const gainDuNiveau = revenuNiveau(residence, l, fTVillage) - revenuNiveau(residence, l - 1, fTVillage);
      return coutNiveau(residence, l, fTVillage) / gainDuNiveau;
    });
    expect(retours.map(Math.round)).toEqual([15, 43, 50, 59, 70]);
  });

  it('refuse un niveau hors de 1 à 5', () => {
    expect(() => coutNiveau(residence, 0, fTVillage)).toThrow(RangeError);
    expect(() => coutNiveau(residence, 6, fTVillage)).toThrow(RangeError);
    expect(() => revenuNiveau(residence, 1.5, fTVillage)).toThrow(RangeError);
    expect(() => dureeChantier(gare, 6)).toThrow(RangeError);
  });

  it('démolition : rend 30 % du cash investi, arrondi en dessous', () => {
    expect(remboursementDemolition(4_430)).toBe(1_329);
    expect(remboursementDemolition(0)).toBe(0);
  });

  it('une seule file de construction au départ', () => {
    expect(FILES_CONSTRUCTION_DEPART).toBe(1);
  });
});

describe('revenus (5.3)', () => {
  it('premier jour (5.9) : sol 218 + 3 Résidences 295 = 1 103 ₮/h', () => {
    const r = revenuNiveau(residence, 1, fTVillage);
    expect(
      revenuTerritoire(
        21_800,
        [r, r, r].map((revenuParHeure) => ({ revenuParHeure, bonusPct: 0 })),
      ),
    ).toBe(1_103);
  });

  it('les bonus (équipement public, gare) s’appliquent au sol et à tous les bâtiments', () => {
    const batiments = [
      { revenuParHeure: 885, bonusPct: 0 },
      { revenuParHeure: 0, bonusPct: 16 }, // équipement public niveau 2
      { revenuParHeure: 0, bonusPct: 10 }, // gare niveau 1
    ];
    expect(revenuTerritoire(21_800, batiments)).toBe(Math.round(1_103 * 1.26));
  });

  it('terrain nu : seulement le revenu du sol', () => {
    expect(revenuTerritoire(21_800, [])).toBe(218);
  });

  it('revenu du joueur : somme des territoires, boost plafonné à 25 %', () => {
    expect(revenuJoueur([1_103, 500])).toBe(1_603);
    expect(revenuJoueur([1_103, 500], 10)).toBe(1_763);
    expect(revenuJoueur([1_103, 500], 40)).toBe(revenuJoueur([1_103, 500], 25));
    expect(revenuJoueur([])).toBe(0);
  });
});

describe('calcul hors ligne par morceaux (5.3)', () => {
  const h = 3_600;

  it('revenu constant : R × Δt', () => {
    expect(gainParMorceaux(0, 2 * h, 1_103)).toBe(2_206);
  });

  it('plafond de 48 h', () => {
    expect(PLAFOND_HORS_LIGNE_S).toBe(48 * h);
    expect(gainParMorceaux(0, 72 * h, 1_000)).toBe(48_000);
  });

  it('un chantier fini pendant l’absence change le revenu à sa date de fin', () => {
    expect(gainParMorceaux(0, h, 1_000, [{ a: h / 2, revenuParHeure: 2_000 }])).toBe(1_500);
  });

  it('les changements peuvent arriver dans le désordre', () => {
    const changements = [
      { a: 2 * h, revenuParHeure: 300 },
      { a: h, revenuParHeure: 200 },
    ];
    expect(gainParMorceaux(0, 3 * h, 100, changements)).toBe(100 + 200 + 300);
  });

  it('un chantier fini après les 48 h comptées ne change rien', () => {
    expect(gainParMorceaux(0, 50 * h, 1_000, [{ a: 49 * h, revenuParHeure: 9_999 }])).toBe(48_000);
  });

  it('un changement daté d’avant le dernier encaissement remplace le revenu de départ', () => {
    expect(gainParMorceaux(10 * h, 11 * h, 1_000, [{ a: 5 * h, revenuParHeure: 400 }])).toBe(400);
  });

  it('ne perd aucune fraction entre les morceaux (une seule troncature à la fin)', () => {
    expect(gainParMorceaux(0, h, 1, [{ a: h / 2, revenuParHeure: 1 }])).toBe(1);
  });

  it('rien à gagner si aucun temps n’est passé', () => {
    expect(gainParMorceaux(100, 100, 1_000)).toBe(0);
    expect(gainParMorceaux(100, 50, 1_000)).toBe(0);
  });

  it('revenu cumulé : Σ R × Δt en ₮ × secondes, sans arrondi', () => {
    expect(revenuCumule(0, 30, 50)).toBe(1_500);
    expect(revenuCumule(0, h, 1_000, [{ a: h / 2, revenuParHeure: 2_000 }])).toBe(1_500 * h);
    expect(revenuCumule(0, 72 * h, 10)).toBe(10 * 48 * h);
  });

  it('les fractions de ₮ restent pour le prochain encaissement', () => {
    // 50 ₮/h encaissés toutes les 30 s : 0 ₮ chaque fois, mais rien n'est perdu au bout d'une heure.
    let reste = 0;
    let encaisse = 0;
    for (let i = 0; i < 120; i++) {
      const partage = partagerCumul(revenuCumule(0, 30, 50), reste);
      encaisse += partage.gain;
      reste = partage.reste;
    }
    expect(encaisse).toBe(50);
    expect(reste).toBe(0);
    expect(partagerCumul(7_199, 0)).toEqual({ gain: 1, reste: 3_599 });
  });
});

describe('apport d’un bâtiment à son territoire', () => {
  it('revenu et bonus du niveau ; rien au niveau 0', () => {
    expect(apportBatiment(residence, 2, 1)).toEqual({
      revenuParHeure: revenuNiveau(residence, 2, 1),
      bonusPct: 0,
    });
    expect(apportBatiment(gare, 3, 1)).toEqual({ revenuParHeure: 0, bonusPct: 30 });
    expect(apportBatiment(gare, 0, 1)).toEqual({ revenuParHeure: 0, bonusPct: 0 });
  });
});

describe('achat, vente, limites (5.4)', () => {
  it('vente à l’État : 70 % de V_T, arrondi à la centaine inférieure', () => {
    expect(prixVenteEtat(26_230)).toBe(18_300);
    expect(prixVenteEtat(21_800)).toBe(15_200);
  });

  it('4 territoires au départ, 12 au maximum avec siège niveau 5, rang Magnat et emplacement acheté', () => {
    expect(TERRITOIRES_DEPART).toBe(4);
    expect(maxTerritoires(0, 0, 0)).toBe(4);
    expect(maxTerritoires(5, 3, 1)).toBe(12);
    expect(maxTerritoires(5, 4, 1)).toBe(12);
    expect(maxTerritoires(5, 2, 0)).toBe(10);
  });

  it('bonus de rang : +1 territoire au rang Baron, +1 au rang Magnat', () => {
    expect(RANGS.map((r) => r.nom)).toEqual(['Entrepreneur', 'Notable', 'Baron', 'Magnat', 'Tycoon']);
    expect([0, 1, 2, 3, 4].map(bonusTerritoiresRang)).toEqual([0, 0, 1, 2, 2]);
  });

  it('capitale déplaçable une fois tous les 7 jours', () => {
    expect(DELAI_DEPLACEMENT_CAPITALE_S).toBe(7 * 24 * 3_600);
  });
});
