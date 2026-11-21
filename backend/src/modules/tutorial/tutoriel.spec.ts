import {
  DUREE_CHANTIER_TUTORIEL_S,
  etapeFaiteReponseSchema,
  prochainMinuitParis,
  tutorielReponseSchema,
} from '@france-tycoon/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

// Tutoriel en temps simulé (docs/05-equilibrage.md, 5.7 ; docs/04, « Quêtes et tutoriel »).
// 10 étapes ; récompenses : 5 000 ₮ (5, premier achat), 2 000 ₮ (7, encaisser), 3 000 ₮ et 5 💎 (10, classement).

const ETAPES_CLIENT = ['bienvenue', 'explorer_carte', 'selecteur_zones', 'fiche_commune', 'quetes', 'opa'];

afterEach(() => {
  vi.useRealTimers();
});

/** Alice suit le tutoriel (horloge figée, demain à 9 h 05 à Paris) ; Bruno l'a passé. */
async function partie() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime((prochainMinuitParis(Math.floor(Date.now() / 1000)) + 9 * 3_600 + 300) * 1000);
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice', { tutoriel: true });
  const maintenant = () => Math.floor(Date.now() / 1000);
  const avancer = (secondes: number) => vi.setSystemTime(Date.now() + secondes * 1000);
  const requete = (method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: { cookie: alice.cookie }, ...(payload ? { payload } : {}) });
  const tutoriel = async () => tutorielReponseSchema.parse((await requete('GET', '/tutorial')).json());
  const faite = async (cle: string) => (await tutoriel()).steps.find((s) => s.key === cle)?.completedAt ?? null;
  const completer = (cle: string) => requete('POST', `/tutorial/${cle}/complete`);
  const solde = () =>
    db.prepare('SELECT cash, premium_currency AS gems FROM users WHERE id = ?').get(alice.id) as {
      cash: number;
      gems: number;
    };
  const recompenses = () =>
    db
      .prepare(
        `SELECT t.step_key AS etape, w.currency, w.amount FROM wallet_transactions AS w
        JOIN tutorials AS t ON t.id = w.ref_id WHERE w.reason = 'tutorial_reward' AND w.ref_type = 'tutorial' ORDER BY w.id`,
      )
      .all();
  return { db, app, alice, maintenant, avancer, requete, tutoriel, faite, completer, solde, recompenses };
}

describe('GET /tutorial', () => {
  it('les 10 étapes dans l’ordre, rien de fait ; 10 000 ₮ et 5 💎 en tout', async () => {
    const p = await partie();

    const reponse = await p.requete('GET', '/tutorial');
    const t = tutorielReponseSchema.parse(reponse.json());

    expect(reponse.headers['cache-control']).toBe('private, no-store');
    expect(t.completedAt).toBeNull();
    expect(t.skipped).toBe(false);
    expect(t.steps.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(t.steps.every((s) => s.completedAt === null)).toBe(true);
    expect(t.steps.filter((s) => s.validatedBy === 'client').map((s) => s.key)).toEqual(ETAPES_CLIENT);
    expect(t.steps.reduce((somme, s) => somme + s.rewardCash, 0)).toBe(10_000);
    expect(t.steps.reduce((somme, s) => somme + s.rewardGems, 0)).toBe(5);
    expect(t.steps[4]).toMatchObject({
      key: 'premier_achat',
      anchor: 'buy-button',
      validatedBy: 'server',
      rewardCash: 5_000,
    });
  });

  it('sans connexion : 401', async () => {
    const p = await partie();
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/tutorial' })).statusCode).toBe(401);
  });
});

describe('POST /tutorial/:stepKey/complete', () => {
  it('une étape de l’écran : gardée une fois, sans récompense', async () => {
    const p = await partie();
    const avant = p.solde();

    const reponse = await p.completer('bienvenue');

    expect(reponse.statusCode).toBe(200);
    const corps = etapeFaiteReponseSchema.parse(reponse.json());
    expect(corps.steps[0]).toMatchObject({ key: 'bienvenue', completedAt: p.maintenant() });
    expect(corps.wallet).toEqual(avant);

    p.avancer(60);
    expect((await p.completer('bienvenue')).statusCode).toBe(200);
    expect(await p.faite('bienvenue')).toBe(p.maintenant() - 60);
  });

  it('étape validée par le serveur : 403 ; clé inconnue : 404 ; clé bizarre : 400', async () => {
    const p = await partie();

    const serveur = await p.completer('premier_achat');
    expect(serveur.statusCode).toBe(403);
    expect(serveur.json().error.code).toBe('FORBIDDEN');
    expect((await p.completer('inconnue')).statusCode).toBe(404);
    expect((await p.completer('PREMIER')).statusCode).toBe(400);
    expect(await p.faite('premier_achat')).toBeNull();
  });
});

describe('étapes validées par le serveur', () => {
  it('achat, premier chantier fini, clic Encaisser, classement : chacune récompensée une fois', async () => {
    const p = await partie();
    const depart = p.solde();

    // 5. Premier achat (dans n'importe quel ordre : les étapes de l'écran ne sont pas encore faites).
    const achat = await p.requete('POST', '/territories/01001/buy');
    expect(achat.statusCode).toBe(200);
    expect(achat.json().wallet.cash).toBe(depart.cash - 21_800 + 5_000);
    expect(await p.faite('premier_achat')).toBe(p.maintenant());

    // 6. Le premier chantier compte quand il est fini (10 s).
    const chantier = await p.requete('POST', '/territories/01001/buildings', { typeCode: 'residence' });
    expect(chantier.statusCode).toBe(200);
    expect(await p.faite('premiere_construction')).toBeNull();
    p.avancer(DUREE_CHANTIER_TUTORIEL_S);
    expect(await p.faite('premiere_construction')).toBe(p.maintenant());

    // 7. Le clic sur « Encaisser » compte, même s'il ne rapporte presque rien.
    const avantClic = p.solde().cash;
    const clic = await p.requete('POST', '/me/collect');
    expect(clic.statusCode).toBe(200);
    expect(clic.json().cash).toBe(avantClic + clic.json().collected + 2_000);
    expect(await p.faite('encaisser')).toBe(p.maintenant());

    // 10. Le classement vu.
    expect((await p.requete('POST', '/events/track', { type: 'leaderboard_viewed', ref: 'national' })).statusCode).toBe(
      204,
    );
    expect(await p.faite('classement')).toBe(p.maintenant());
    expect(p.solde().gems).toBe(depart.gems + 5);

    // Refaire les mêmes actions ne rapporte plus rien.
    await p.requete('POST', '/me/collect');
    await p.requete('POST', '/events/track', { type: 'leaderboard_viewed', ref: 'national' });
    expect(p.recompenses()).toEqual([
      { etape: 'premier_achat', currency: 'cash', amount: 5_000 },
      { etape: 'encaisser', currency: 'cash', amount: 2_000 },
      { etape: 'classement', currency: 'cash', amount: 3_000 },
      { etape: 'classement', currency: 'gems', amount: 5 },
    ]);
    expect((await p.tutoriel()).completedAt).toBeNull();
  });

  it('les 10 étapes faites : tutoriel fini, 10 000 ₮ et 5 💎 versés', async () => {
    const p = await partie();
    for (const cle of ETAPES_CLIENT) expect((await p.completer(cle)).statusCode).toBe(200);
    await p.requete('POST', '/territories/01001/buy');
    await p.requete('POST', '/territories/01001/buildings', { typeCode: 'residence' });
    p.avancer(DUREE_CHANTIER_TUTORIEL_S);
    await p.requete('POST', '/me/collect');
    expect((await p.tutoriel()).completedAt).toBeNull();

    await p.requete('POST', '/events/track', { type: 'leaderboard_viewed', ref: 'national' });

    const fin = await p.tutoriel();
    expect(fin.completedAt).toBe(p.maintenant());
    expect(fin.steps.every((s) => s.completedAt !== null)).toBe(true);
    const verse = p.recompenses() as { currency: string; amount: number }[];
    expect(verse.filter((r) => r.currency === 'cash').reduce((s, r) => s + r.amount, 0)).toBe(10_000);
    expect(verse.filter((r) => r.currency === 'gems').reduce((s, r) => s + r.amount, 0)).toBe(5);
  });
});

describe('POST /tutorial/skip', () => {
  it('après « Passer », plus rien ne compte ni ne rapporte', async () => {
    const p = await partie();
    expect((await p.completer('bienvenue')).statusCode).toBe(200);
    const avant = p.solde().cash;

    const reponse = await p.requete('POST', '/tutorial/skip');
    expect(reponse.statusCode).toBe(200);
    expect(tutorielReponseSchema.parse(reponse.json())).toMatchObject({ skipped: true, completedAt: null });

    await p.requete('POST', '/territories/01001/buy');
    await p.completer('explorer_carte');
    const t = await p.tutoriel();

    expect(t.skipped).toBe(true);
    expect(t.steps.filter((s) => s.completedAt !== null).map((s) => s.key)).toEqual(['bienvenue']);
    expect(p.solde().cash).toBe(avant - 21_800);
    expect(p.recompenses()).toEqual([]);
    expect((await p.requete('POST', '/tutorial/skip')).statusCode).toBe(200);
  });
});
