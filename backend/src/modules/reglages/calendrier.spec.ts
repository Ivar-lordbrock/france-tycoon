import { describe, expect, it } from 'vitest';
import { cumulDepuis } from '../income/revenus.ts';
import { calendrier, type EvenementReglages } from './calendrier.ts';

const normal = { price: 100, income: 100, building: 100 };
const ev = (id: number, debut: number, fin: number, r: Partial<typeof normal>): EvenementReglages => ({
  id,
  title: `Événement ${id}`,
  debut,
  fin,
  ...normal,
  ...r,
});

describe('réglages à chaud : calendrier', () => {
  it('base la plus récente × événements en cours ; fin automatique ; ruptures dans la fenêtre', () => {
    const c = calendrier([{ debut: 100, ...normal, price: 50 }], [ev(1, 200, 300, { income: 200 })], 0, 1_000);
    expect(c.a(50)).toEqual(normal);
    expect(c.a(100)).toEqual({ ...normal, price: 50 });
    expect(c.a(250)).toEqual({ price: 50, income: 200, building: 100 });
    expect(c.a(300)).toEqual({ ...normal, price: 50 }); // l'événement s'arrête tout seul à sa fin
    expect(c.evenementsA(250).map((e) => e.id)).toEqual([1]);
    expect(c.ruptures).toEqual([100, 200, 300]);
    expect(calendrier([], [ev(1, 200, 300, {})], 250, 1_000).ruptures).toEqual([300]);
  });

  it('les événements se multiplient, bornés entre ÷ 10 et × 10', () => {
    const t = 10;
    const forts = [ev(1, 0, 99, { income: 400 }), ev(2, 0, 99, { income: 400 })];
    expect(calendrier([{ debut: 0, ...normal, income: 400 }], forts, 0, t).a(t).income).toBe(1_000);
    const faibles = [ev(1, 0, 99, { price: 25 }), ev(2, 0, 99, { price: 25 })];
    expect(calendrier([], faibles, 0, t).a(t).price).toBe(10);
    const cumules = [ev(1, 0, 99, { building: 150 }), ev(2, 0, 99, { building: 200 })];
    expect(calendrier([], cumules, 0, t).a(t).building).toBe(300);
  });

  it('revenus non encaissés : l’événement ne compte que pendant ses dates', () => {
    // Sol seul : 1 % de 360 000 = 3 600 ₮/h. 3 h d'absence, revenus × 2 pendant la 2ᵉ heure.
    const territoires = [{ baseValue: 360_000, batiments: [] }];
    const h = 3_600;
    expect(cumulDepuis(territoires, 0, 3 * h) / h).toBe(10_800);
    const c = calendrier([], [ev(1, h, 2 * h, { income: 200 })], 0, 3 * h);
    expect(cumulDepuis(territoires, 0, 3 * h, c) / h).toBe(14_400);
    // Un événement fini avant le dernier encaissement ne change rien.
    const passe = calendrier([], [ev(1, -2 * h, -h, { income: 200 })], 0, 3 * h);
    expect(cumulDepuis(territoires, 0, 3 * h, passe) / h).toBe(10_800);
  });
});
