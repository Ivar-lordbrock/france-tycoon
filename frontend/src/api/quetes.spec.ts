import type { MoiReponse, Quete, QuetesReponse } from '@france-tycoon/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { apresEncaissement, apresReclamation } from './quetes.ts';

const moi = { user: { id: 4, pseudo: 'Bruno' }, wallet: { cash: 1_000, gems: 2 }, incomePerHour: 300 } as MoiReponse;
const quete = (id: number, claimedAt: number | null) =>
  ({ id, title: `Quête ${id}`, progress: 1, target: 1, completedAt: 100, claimedAt }) as Quete;
const perime = (c: QueryClient, cle: readonly unknown[]) => c.getQueryState(cle)?.isInvalidated;

function client() {
  const c = new QueryClient();
  c.setQueryData(['moi'], moi);
  c.setQueryData<QuetesReponse>(['quetes'], {
    date: '2026-11-21',
    resetsAt: 0,
    quests: [quete(1, null), quete(2, null)],
  });
  return c;
}

describe('quêtes et encaissement', () => {
  it('« Encaisser » : nouveau cash et revenu tout de suite, gemmes gardées, profil et quêtes relus', async () => {
    const c = client();
    await apresEncaissement(c, { collected: 40, cash: 3_040, incomePerHour: 320 });
    expect(c.getQueryData(['moi'])).toMatchObject({ wallet: { cash: 3_040, gems: 2 }, incomePerHour: 320 });
    expect(perime(c, ['moi'])).toBe(true);
    expect(perime(c, ['quetes'])).toBe(true);
  });

  it('« Réclamer » : seule la quête réclamée change, le solde suit', async () => {
    const c = client();
    await apresReclamation(c, { quest: quete(2, 200), wallet: { cash: 2_500, gems: 4 } });
    expect(c.getQueryData<QuetesReponse>(['quetes'])?.quests.map((q) => q.claimedAt)).toEqual([null, 200]);
    expect(c.getQueryData(['moi'])).toMatchObject({ wallet: { cash: 2_500, gems: 4 } });
    expect(perime(c, ['moi'])).toBe(true);
  });
});
