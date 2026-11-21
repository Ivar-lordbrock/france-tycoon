import { prochainMinuitParis, quetesReponseSchema } from '@france-tycoon/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { SUIVI_PAR_MINUTE } from './suivi.ts';

// POST /events/track (docs/04, « Quêtes et tutoriel ») : ce que seul l'écran voit fait avancer les quêtes.

afterEach(() => {
  vi.useRealTimers();
});

/** Horloge figée demain à 9 h 05 (heure de Paris) ; quêtes possibles : Repérage (3), Outre-mer (2), Veille. */
async function partie() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime((prochainMinuitParis(Math.floor(Date.now() / 1000)) + 9 * 3_600 + 300) * 1000);
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 12_000 },
  ]);
  db.prepare('UPDATE daily_quests SET is_active = 0').run();
  for (const [code, objectif] of [
    ['reperage', 3],
    ['cap_outre_mer', 2],
    ['veille', 1],
  ] as const) {
    db.prepare('UPDATE daily_quests SET is_active = 1, target_min = ?, target_max = ? WHERE code = ?').run(
      objectif,
      objectif,
      code,
    );
  }
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const suivre = (type: string, ref: string, cookie = alice.cookie) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/events/track',
      headers: cookie ? { cookie } : {},
      payload: { type, ref },
    });
  const progres = async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/me/quests', headers: { cookie: alice.cookie } });
    return Object.fromEntries(quetesReponseSchema.parse(r.json()).quests.map((q) => [q.code, q.progress]));
  };
  const avancer = (secondes: number) => vi.setSystemTime(Date.now() + secondes * 1000);
  return { app, alice, suivre, progres, avancer };
}

describe('POST /events/track', () => {
  it('fiche ouverte : une même commune ne compte qu’une fois ; commune inconnue : 404', async () => {
    const p = await partie();

    const reponse = await p.suivre('territory_visited', '01001');
    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    await p.suivre('territory_visited', '01001');
    await p.suivre('territory_visited', '01002');

    expect((await p.progres()).reperage).toBe(2);
    const inconnue = await p.suivre('territory_visited', '99999');
    expect(inconnue.statusCode).toBe(404);
    expect(inconnue.json().error.code).toBe('NOT_FOUND');
  });

  it('zones : seules celles d’Outre-mer comptent ; zone inconnue : 400', async () => {
    const p = await partie();

    expect((await p.suivre('zone_visited', 'MET')).statusCode).toBe(204);
    expect((await p.progres()).cap_outre_mer).toBe(0);
    await p.suivre('zone_visited', 'GP');
    await p.suivre('zone_visited', 'GP');
    expect((await p.progres()).cap_outre_mer).toBe(1);
    await p.suivre('zone_visited', 'RE');
    expect((await p.progres()).cap_outre_mer).toBe(2);
    expect((await p.suivre('zone_visited', 'XX')).statusCode).toBe(400);
  });

  it('classement vu : « Veille concurrentielle » réussie', async () => {
    const p = await partie();
    expect((await p.suivre('leaderboard_viewed', 'national')).statusCode).toBe(204);
    expect((await p.progres()).veille).toBe(1);
  });

  it('refusé : action que le serveur voit déjà, sans connexion', async () => {
    const p = await partie();
    expect((await p.suivre('territory_bought', '01001')).statusCode).toBe(400);
    expect((await p.suivre('territory_visited', '')).statusCode).toBe(400);
    expect((await p.suivre('territory_visited', '01001', '')).statusCode).toBe(401);
  });

  it(`au plus ${SUIVI_PAR_MINUTE} par minute et par joueur`, async () => {
    const p = await partie();
    for (let i = 0; i < SUIVI_PAR_MINUTE; i++) {
      expect((await p.suivre('leaderboard_viewed', 'national')).statusCode).toBe(204);
    }

    const trop = await p.suivre('leaderboard_viewed', 'national');
    expect(trop.statusCode).toBe(429);
    expect(trop.json().error.code).toBe('RATE_LIMITED');

    const bruno = await connecter(p.app, 'Bruno');
    expect((await p.suivre('leaderboard_viewed', 'national', bruno.cookie)).statusCode).toBe(204);
    p.avancer(60);
    expect((await p.suivre('leaderboard_viewed', 'national')).statusCode).toBe(204);
  });
});
