import type { FicheCommune, MoiReponse } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { lieu, proprietaire, raisonAchat, tycoons } from './fiche-texte.ts';

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
