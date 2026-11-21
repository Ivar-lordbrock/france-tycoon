import type { MoiReponse } from '@france-tycoon/shared';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToasts } from '../etat/toasts.ts';
import { traiterEvenement } from './direct.ts';

const moi = {
  user: { id: 4, pseudo: 'Bruno' },
  wallet: { cash: 1_000, gems: 2 },
  incomePerHour: 300,
} as MoiReponse;

function client() {
  const c = new QueryClient();
  c.setQueryData(['moi'], moi);
  c.setQueryData(['moi', 'notifications'], { pages: [], pageParams: [] });
  c.setQueryData(['fiche', '01001'], { insee: '01001' });
  c.setQueryData(['fiche', '01002'], { insee: '01002' });
  return c;
}
const perime = (c: QueryClient, cle: readonly unknown[]) => c.getQueryState(cle)?.isInvalidated;

describe('événements en direct', () => {
  beforeEach(() => useToasts.setState({ toasts: [] }));

  it('nouveau solde : posé tout de suite, sans relire /me', () => {
    const c = client();
    traiterEvenement(c, { type: 'wallet.changed', data: { cash: 5_000, gems: 2, incomePerHour: 0 } });
    expect(c.getQueryData(['moi'])).toMatchObject({ wallet: { cash: 5_000, gems: 2 }, incomePerHour: 0 });
    expect(perime(c, ['moi'])).toBe(false);
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it('OPA reçue : profil, messages et fiche de la commune relus, petit message', () => {
    const c = client();
    traiterEvenement(c, {
      type: 'takeover.received',
      data: {
        id: 12,
        createdAt: 1_800_000_000,
        readAt: null,
        kind: 'takeover_received',
        payload: {
          takeoverId: 7,
          territoryInsee: '01001',
          territoryName: 'L’Abergement-Clémenciat',
          attackerPseudo: 'Alice',
          offerAmount: 32_700,
          defenseCost: 7_700,
          expiresAt: 1_800_086_400,
        },
      },
    });
    expect(perime(c, ['moi'])).toBe(true);
    expect(perime(c, ['moi', 'notifications'])).toBe(true);
    expect(perime(c, ['fiche', '01001'])).toBe(true);
    expect(perime(c, ['fiche', '01002'])).toBe(false);
    expect(useToasts.getState().toasts).toMatchObject([{ ton: 'alerte', commune: { insee: '01001' } }]);
  });

  it('quête réussie : profil, messages et quêtes du jour relus, petit message', () => {
    const c = client();
    c.setQueryData(['quetes'], { quests: [] });
    traiterEvenement(c, {
      type: 'quest.completed',
      data: {
        id: 13,
        createdAt: 1_800_000_000,
        readAt: null,
        kind: 'quest_completed',
        payload: { questId: 3, code: 'chantiers', title: 'Chef de chantier', rewardCash: 1_500, rewardGems: 0 },
      },
    });
    expect(perime(c, ['moi'])).toBe(true);
    expect(perime(c, ['quetes'])).toBe(true);
    expect(perime(c, ['fiche', '01001'])).toBe(false);
    expect(useToasts.getState().toasts).toMatchObject([{ ton: 'info' }]);
  });
});
