import {
  appelAProjetsReponseSchema,
  appelDeLaSemaine,
  contenuProjetReussiSchema,
  type EvenementQuete,
  notificationsReponseSchema,
  prochainLundiParis,
  semaineParis,
} from '@france-tycoon/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { emettre } from '../evenements/bus.ts';

// Appels à projets de l'État en temps simulé (docs/05-equilibrage.md, 5.11 ; docs/04, « Appels à projets »).

const h = 3_600;

afterEach(() => {
  vi.useRealTimers();
});

/** Lundi minuit (Paris) de la prochaine semaine dont le projet est `code`. */
function lundiDuProjet(code: string): number {
  let t = prochainLundiParis(Math.floor(Date.now() / 1000));
  while (appelDeLaSemaine(semaineParis(t)).code !== code) t = prochainLundiParis(t);
  return t;
}

/** Une partie un lundi à 9 h (heure de Paris), semaine du « Plan Logement » (6 chantiers de Résidence). */
async function partie() {
  const lundi = lundiDuProjet('plan_logement');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime((lundi + 9 * h) * 1000);
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const maintenant = () => Math.floor(Date.now() / 1000);
  const projet = async (cookie = alice.cookie) => {
    const reponse = await app.inject({ method: 'GET', url: '/api/v1/me/state-project', headers: { cookie } });
    expect(reponse.statusCode).toBe(200);
    return appelAProjetsReponseSchema.parse(reponse.json());
  };
  /** Un chantier fini, comme le signale l'encaissement. */
  const chantierFini = (kind: string, type: EvenementQuete = 'building_started') =>
    db.transaction(() => emettre(db, { userId: alice.id, type, kind, tirer: false }, maintenant())).immediate();
  const primes = () =>
    db
      .prepare(
        "SELECT currency, amount FROM wallet_transactions WHERE user_id = ? AND ref_type = 'state_project' ORDER BY id",
      )
      .all(alice.id);
  return { db, app, alice, lundi, maintenant, projet, chantierFini, primes };
}

describe('appels à projets', () => {
  it('sans connexion : 401', async () => {
    const p = await partie();
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/me/state-project' })).statusCode).toBe(401);
  });

  it('le projet de la semaine, pas encore commencé : prime minimale, fin lundi prochain', async () => {
    const p = await partie();
    const r = await p.projet();
    expect(r.week).toBe(semaineParis(p.lundi));
    expect(r.endsAt).toBe(prochainLundiParis(p.lundi));
    expect(r.project).toEqual({
      code: 'plan_logement',
      title: 'Plan Logement',
      description: 'Termine 6 chantiers de Résidence (construction ou amélioration).',
      target: 6,
      progress: 0,
      rewardCash: 15_000,
      rewardGems: 10,
      completedAt: null,
    });
  });

  it('seuls les chantiers demandés comptent ; réussi, la prime est versée une fois, avec un message', async () => {
    const p = await partie();
    p.chantierFini('commerce');
    p.chantierFini('residence', 'building_upgraded'); // le projet compte les chantiers finis, pas les améliorations
    expect((await p.projet()).project.progress).toBe(0);

    for (let i = 0; i < 5; i++) p.chantierFini('residence');
    expect((await p.projet()).project.progress).toBe(5);
    expect(p.primes()).toEqual([]);

    p.chantierFini('residence');
    const { project } = await p.projet();
    expect(project.progress).toBe(6);
    expect(project.completedAt).toBe(p.maintenant());
    expect(p.primes()).toEqual([
      { currency: 'cash', amount: 15_000 },
      { currency: 'gems', amount: 10 },
    ]);

    // Encore des chantiers : rien de plus.
    p.chantierFini('residence');
    expect(p.primes()).toHaveLength(2);
    expect((await p.projet()).project.progress).toBe(6);

    const messages = p.db
      .prepare("SELECT payload FROM notifications WHERE user_id = ? AND kind = 'project_completed'")
      .pluck()
      .all(p.alice.id) as string[];
    expect(messages.map((m) => contenuProjetReussiSchema.parse(JSON.parse(m)))).toEqual([
      { code: 'plan_logement', title: 'Plan Logement', rewardCash: 15_000, rewardGems: 10 },
    ]);
    // Le centre de notifications accepte le nouveau type.
    const liste = await p.app.inject({
      method: 'GET',
      url: '/api/v1/me/notifications',
      headers: { cookie: p.alice.cookie },
    });
    expect(liste.statusCode).toBe(200);
    expect(
      notificationsReponseSchema.parse(liste.json()).notifications.some((n) => n.kind === 'project_completed'),
    ).toBe(true);
  });

  it('un vrai chantier de Résidence fini fait avancer le projet', async () => {
    const p = await partie();
    const req = (method: 'GET' | 'POST', url: string, payload?: object) =>
      p.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: p.alice.cookie }, payload });
    expect((await req('POST', '/territories/01001/buy')).statusCode).toBe(200);
    expect((await req('POST', '/territories/01001/buildings', { typeCode: 'residence' })).statusCode).toBe(200);
    expect((await p.projet()).project.progress).toBe(0); // lancé, pas fini
    vi.setSystemTime(Date.now() + h * 1000);
    expect((await p.projet()).project.progress).toBe(1);
  });

  it('lundi suivant : nouveau projet, on repart de zéro', async () => {
    const p = await partie();
    p.chantierFini('residence');
    vi.setSystemTime(prochainLundiParis(p.maintenant()) * 1000 + 1000);
    const r = await p.projet();
    expect(r.week).not.toBe(semaineParis(p.lundi));
    expect(r.project.code).not.toBe('plan_logement');
    expect(r.project.progress).toBe(0);
  });
});
