import type { FicheCommune, MoiReponse } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { lieu, phraseEquipements, phrasePlaces, proprietaire, raisonAchat, tycoons } from './fiche-texte.ts';

const fiche = {
  insee: '01001',
  name: 'L’Abergement-Clémenciat',
  department: '01',
  zone: 'MET',
  baseValue: 21_800,
  state: 'free',
  owner: null,
  shieldUntil: null,
  actions: { canBuy: false, buyPrice: 21_800, buyReasons: [], canTakeover: false, takeoverReasons: [] },
} as unknown as FicheCommune;

const moi = { wallet: { cash: 20_000, gems: 0 }, territories: { owned: 3, max: 3 } } as MoiReponse;

describe('textes de la fiche commune', () => {
  it('écrit les montants à la française', () => {
    expect(tycoons(21_800)).toMatch(/^21\s800 ₮$/);
  });

  it('résume les équipements en une phrase, au singulier comme au pluriel', () => {
    const espaces = (t: string) => t.replace(/\s/g, ' ');
    expect(
      phraseEquipements({
        equipments: [
          { category: 'commerce', count: 2, source: 'bpe' },
          { category: 'service', count: 1_200, source: 'bpe' },
          { category: 'education', count: 1, source: 'bpe' },
        ],
        areaKm2: 43.6,
      }),
    ).toSatisfy((t: string) => espaces(t) === '2 commerces, 1 200 services et 1 école sur 44 km².');
    expect(phraseEquipements({ equipments: [{ category: 'gare', count: 1, source: 'osm' }], areaKm2: null })).toBe(
      '1 gare.',
    );
    expect(phraseEquipements({ equipments: [], areaKm2: 5 })).toBe('Aucun équipement recensé sur 5 km².');
  });

  it('compte les places de bâtiments libres', () => {
    expect(phrasePlaces({ used: 0, total: 6 })).toBe('6 places de bâtiments libres');
    expect(phrasePlaces({ used: 2, total: 3 })).toBe('1 place de bâtiment libre');
    expect(phrasePlaces({ used: 3, total: 3 })).toBe('Toutes les places de bâtiments sont prises');
  });

  it('situe la commune : département en Métropole, zone en outre-mer', () => {
    expect(lieu({ zone: 'MET', department: '01' })).toBe('Département 01');
    expect(lieu({ zone: 'PF', department: '987' })).toBe('Polynésie française');
  });

  it('dit à qui est la commune', () => {
    expect(proprietaire(fiche)).toBe('Libre');
    expect(proprietaire({ ...fiche, state: 'mine' })).toBe('À toi');
    expect(proprietaire({ ...fiche, state: 'mine', shieldUntil: 1_800_000_000 })).toMatch(
      /^À toi, sous bouclier jusqu’à /,
    );
    expect(
      proprietaire({
        ...fiche,
        state: 'rival',
        owner: { pseudo: 'Bob', markerColor: '#000000', avatarUrl: null, isMe: false },
      }),
    ).toBe('À Bob');
  });

  it('explique pourquoi on ne peut pas acheter', () => {
    expect(raisonAchat('UNAUTHENTICATED', fiche, null)).toBe('Connecte-toi pour l’acheter.');
    expect(raisonAchat('INSUFFICIENT_FUNDS', fiche, moi)).toMatch(/^Il te manque 1\s800 ₮\.$/);
    expect(raisonAchat('TERRITORY_LIMIT_REACHED', fiche, moi)).toBe('Tu as déjà 3 territoires sur 3.');
    expect(raisonAchat('TERRITORY_NOT_FREE', fiche, moi)).toBeNull();
  });
});
