import { describe, expect, it } from 'vitest';
import {
  ACTIVITE_MAJ_S,
  ANCIENNETE_ATTAQUANT_S,
  AVERTISSEMENT_INACTIVITE_S,
  BOUCLIER_ACHAT_S,
  BOUCLIER_DEFENSE_S,
  BOUCLIER_OPA_REUSSIE_S,
  cibleTropPetite,
  DELAI_APRES_ECHEC_OPA_S,
  DELAI_REPONSE_OPA_S,
  LIBERATION_INACTIVITE_S,
  montantsOpa,
  OPA_RECUES_MAX,
  opaSortantesMax,
  PROTECTION_DEBUTANT_S,
  patrimoine,
  prixVenteEtat,
  rachatInactivite,
} from './balance.ts';

const heure = 3_600;
const jour = 24 * heure;

describe('montants d’une OPA (5.5)', () => {
  it('tableau de docs/05 : village à 30 000 ₮ et Annecy à 3 000 000 ₮', () => {
    expect(montantsOpa(30_000)).toEqual({ offre: 45_000, defense: 10_500, indemnite: 2_300 });
    expect(montantsOpa(3_000_000)).toEqual({ offre: 4_500_000, defense: 1_050_000, indemnite: 225_000 });
  });

  it('arrondit à la centaine supérieure', () => {
    // Village 01001 sans bâtiment : V_T = 21 800 ₮.
    expect(montantsOpa(21_800)).toEqual({ offre: 32_700, defense: 7_700, indemnite: 1_700 });
    expect(montantsOpa(26_230)).toEqual({ offre: 39_400, defense: 9_200, indemnite: 2_000 });
  });

  it('ne monte pas d’une centaine de trop quand le compte tombe juste', () => {
    for (const valeur of [20_000, 30_000, 60_000, 100_000, 140_000, 1_000_000]) {
      const { defense } = montantsOpa(valeur);
      expect(defense).toBe((valeur * 35) / 100);
    }
  });
});

describe('conditions pour lancer une OPA (5.5)', () => {
  it('délais et boucliers', () => {
    expect(DELAI_REPONSE_OPA_S).toBe(24 * heure);
    expect(BOUCLIER_DEFENSE_S).toBe(72 * heure);
    expect(BOUCLIER_OPA_REUSSIE_S).toBe(48 * heure);
    expect(BOUCLIER_ACHAT_S).toBe(12 * heure);
    expect(PROTECTION_DEBUTANT_S).toBe(72 * heure);
    expect(ANCIENNETE_ATTAQUANT_S).toBe(7 * jour);
    expect(DELAI_APRES_ECHEC_OPA_S).toBe(7 * jour);
  });

  it('une OPA à la fois, deux à partir du rang Magnat ; deux reçues au plus', () => {
    expect([0, 1, 2, 3, 4].map(opaSortantesMax)).toEqual([1, 1, 1, 2, 2]);
    expect(OPA_RECUES_MAX).toBe(2);
  });

  it('patrimoine : cash + valeur des territoires + séquestres', () => {
    expect(patrimoine(1_000, [21_800, 30_000], [45_000])).toBe(97_800);
    expect(patrimoine(30_000, [], [])).toBe(30_000);
  });

  it('cible trop petite sous 25 % du patrimoine de l’attaquant', () => {
    expect(cibleTropPetite(24_999, 100_000)).toBe(true);
    expect(cibleTropPetite(25_000, 100_000)).toBe(false);
    expect(cibleTropPetite(500_000, 100_000)).toBe(false);
    expect(cibleTropPetite(0, 0)).toBe(false);
  });
});

describe('inactivité (5.6)', () => {
  it('message à J+11, communes libérées à J+14, activité notée toutes les 5 min', () => {
    expect(AVERTISSEMENT_INACTIVITE_S).toBe(11 * jour);
    expect(LIBERATION_INACTIVITE_S).toBe(14 * jour);
    expect(ACTIVITE_MAJ_S).toBe(5 * 60);
  });

  it('l’État rachète 50 % de V0 + bâtiments, arrondi à la centaine inférieure', () => {
    expect(rachatInactivite(21_800, 0)).toBe(10_900);
    expect(rachatInactivite(21_800, 4_430)).toBe(13_100); // 50 % de 26 230 = 13 115
  });

  it('partir sans rien dire rapporte moins que vendre soi-même à l’État', () => {
    expect(rachatInactivite(21_800, 4_430)).toBeLessThan(prixVenteEtat(21_800 + 4_430));
  });
});
