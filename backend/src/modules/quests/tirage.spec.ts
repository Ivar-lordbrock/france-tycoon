import { describe, expect, it } from 'vitest';
import { generateur, type ModeleQuete, tirerQuetes } from './tirage.ts';

// Tirage des quêtes du jour (docs/05-equilibrage.md, 5.7), sans base : un petit catalogue écrit ici.

let suivant = 1;
function modele(code: string, champs: Partial<ModeleQuete> = {}): ModeleQuete {
  return {
    id: suivant++,
    code,
    eventType: 'login',
    difficulty: 'facile',
    targetMin: 1,
    targetMax: 1,
    weight: 10,
    minTerritories: 0,
    rewardIncomeHours: 1,
    rewardCashMin: 500,
    rewardGems: 0,
    ...champs,
  };
}

const catalogue = [
  modele('bureau'),
  modele('reperage', { eventType: 'territory_visited', targetMin: 3, targetMax: 8 }),
  modele('outre_mer', { eventType: 'zone_visited', targetMin: 1, targetMax: 3 }),
  modele('tresorier', { eventType: 'income_collected', minTerritories: 1 }),
  modele('chantiers', { eventType: 'building_started', difficulty: 'moyen', minTerritories: 1, targetMax: 3 }),
  modele('expansion', { eventType: 'territory_bought', difficulty: 'difficile', minTerritories: 2 }),
  modele('raider', { eventType: 'takeover_launched', difficulty: 'difficile', minTerritories: 3 }),
];

const codes = (tirees: ReturnType<typeof tirerQuetes>) => tirees.map((t) => t.modele.code);

describe('tirage des quêtes du jour (5.7)', () => {
  it('même graine, même tirage ; une autre graine peut changer le tirage', () => {
    expect(tirerQuetes(catalogue, 5, '7:2026-11-17')).toEqual(tirerQuetes(catalogue, 5, '7:2026-11-17'));
    const differents = new Set<string>();
    for (let jour = 1; jour <= 30; jour++) {
      differents.add(JSON.stringify(tirerQuetes(catalogue, 5, `7:2026-11-${String(jour).padStart(2, '0')}`)));
    }
    expect(differents.size).toBeGreaterThan(1);
  });

  it('1 facile, 1 moyenne, 1 difficile, places 1 à 3, objectif entre le minimum et le maximum', () => {
    for (let joueur = 1; joueur <= 200; joueur++) {
      const tirees = tirerQuetes(catalogue, 5, `${joueur}:2026-11-17`);
      expect(tirees.map((t) => t.modele.difficulty)).toEqual(['facile', 'moyen', 'difficile']);
      expect(tirees.map((t) => t.slot)).toEqual([1, 2, 3]);
      for (const { modele: m, target } of tirees) {
        expect(target).toBeGreaterThanOrEqual(m.targetMin);
        expect(target).toBeLessThanOrEqual(m.targetMax);
        expect(Number.isInteger(target)).toBe(true);
      }
    }
  });

  it('seulement les quêtes dont le joueur a assez de territoires', () => {
    for (let joueur = 1; joueur <= 200; joueur++) {
      const deux = codes(tirerQuetes(catalogue, 2, `${joueur}:2026-11-17`));
      expect(deux).not.toContain('raider');
      expect(deux[2]).toBe('expansion');
    }
  });

  it('joueur sans commune : 3 quêtes faciles différentes à la place', () => {
    for (let joueur = 1; joueur <= 200; joueur++) {
      const tirees = tirerQuetes(catalogue, 0, `${joueur}:2026-11-17`);
      expect(tirees.map((t) => t.modele.difficulty)).toEqual(['facile', 'facile', 'facile']);
      expect(new Set(codes(tirees)).size).toBe(3);
      expect(codes(tirees)).not.toContain('tresorier');
    }
  });

  it('plus assez de quêtes faciles : la liste est plus courte, sans doublon', () => {
    const petit = [modele('seule')];
    expect(codes(tirerQuetes(petit, 0, '1:2026-11-17'))).toEqual(['seule']);
    expect(tirerQuetes([], 0, '1:2026-11-17')).toEqual([]);
  });

  it('chaque quête a une chance proportionnelle à son poids', () => {
    const pondere = [modele('rare', { weight: 1 }), modele('courante', { weight: 3 })];
    let rares = 0;
    const essais = 4_000;
    for (let joueur = 1; joueur <= essais; joueur++) {
      if (tirerQuetes(pondere, 0, `${joueur}:2026-11-17`)[0]?.modele.code === 'rare') rares++;
    }
    expect(rares / essais).toBeGreaterThan(0.2);
    expect(rares / essais).toBeLessThan(0.3);
  });

  it('le générateur donne des nombres entre 0 et 1', () => {
    const hasard = generateur('graine');
    for (let i = 0; i < 1_000; i++) {
      const x = hasard();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
