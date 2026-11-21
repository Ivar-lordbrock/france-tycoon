import {
  chantierReponseSchema,
  contenuQueteTermineeSchema,
  jourParis,
  prochainMinuitParis,
  type Quete,
  quetesReponseSchema,
  reclamerQueteReponseSchema,
} from '@france-tycoon/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { emettre } from '../evenements/bus.ts';

// Quêtes du jour en temps simulé (docs/05-equilibrage.md, 5.7 ; docs/04, « Quêtes et tutoriel »).
// Chaque test choisit les quêtes actives : le tirage n'a alors qu'une seule issue possible.

const h = 3_600;

afterEach(() => {
  vi.useRealTimers();
});

/** Une partie à l'horloge figée, demain à 9 h 05 (heure de Paris) : loin de minuit. Rien n'est acheté. */
async function partie() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime((prochainMinuitParis(Math.floor(Date.now() / 1000)) + 9 * h + 300) * 1000);
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 12_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const sql = (requete: string, ...valeurs: unknown[]) => db.prepare(requete).run(...valeurs);
  const maintenant = () => Math.floor(Date.now() / 1000);
  const avancer = (secondes: number) => vi.setSystemTime(Date.now() + secondes * 1000);
  const requete = (method: 'GET' | 'POST', url: string, options: { cookie?: string; cle?: string } = {}) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: options.cookie ?? alice.cookie, ...(options.cle ? { 'idempotency-key': options.cle } : {}) },
    });
  /** Seules ces quêtes peuvent être tirées ; `objectifs` fixe leur objectif. */
  const activer = (objectifs: Record<string, number>) => {
    sql('UPDATE daily_quests SET is_active = 0');
    for (const [code, objectif] of Object.entries(objectifs)) {
      sql(
        'UPDATE daily_quests SET is_active = 1, target_min = ?, target_max = ? WHERE code = ?',
        objectif,
        objectif,
        code,
      );
    }
  };
  const quetes = async (cookie = alice.cookie) => {
    const reponse = await requete('GET', '/me/quests', { cookie });
    expect(reponse.statusCode).toBe(200);
    return quetesReponseSchema.parse(reponse.json());
  };
  const quete = async (code: string, cookie = alice.cookie): Promise<Quete> => {
    const q = (await quetes(cookie)).quests.find((x) => x.code === code);
    if (!q) throw new Error(`quête ${code} pas tirée`);
    return q;
  };
  const reclamer = (id: number, cle?: string, cookie = alice.cookie) =>
    requete('POST', `/me/quests/${id}/claim`, { cookie, cle });
  const cash = (id = alice.id) => db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(id) as number;
  const messages = (id = alice.id) =>
    db
      .prepare("SELECT payload FROM notifications WHERE user_id = ? AND kind = 'quest_completed' ORDER BY id")
      .pluck()
      .all(id)
      .map((p) => contenuQueteTermineeSchema.parse(JSON.parse(p as string)));
  /** Lance une Résidence au village 01001 (Alice). */
  const construire = async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/v1/territories/01001/buildings',
      headers: { cookie: alice.cookie },
      payload: { typeCode: 'residence' },
    });
    expect(reponse.statusCode).toBe(200);
    return chantierReponseSchema.parse(reponse.json());
  };
  return {
    db,
    app,
    alice,
    bruno,
    sql,
    maintenant,
    avancer,
    requete,
    activer,
    quetes,
    quete,
    reclamer,
    cash,
    messages,
    construire,
  };
}

describe('GET /me/quests', () => {
  it('3 quêtes tirées au premier appel du jour, les mêmes ensuite ; « Passer au bureau » déjà réussie', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, reperage: 5, cap_outre_mer: 2 });

    const reponse = await p.requete('GET', '/me/quests');
    const premier = quetesReponseSchema.parse(reponse.json());
    const second = await p.quetes();

    expect(reponse.headers['cache-control']).toBe('private, no-store');
    expect(premier.date).toBe(jourParis(p.maintenant()));
    expect(premier.resetsAt).toBe(prochainMinuitParis(p.maintenant()));
    expect(premier.quests.map((q) => q.slot)).toEqual([1, 2, 3]);
    expect(premier.quests.map((q) => q.code).sort()).toEqual(['cap_outre_mer', 'passer_au_bureau', 'reperage']);
    expect(second).toEqual(premier);
    const parCode = Object.fromEntries(premier.quests.map((q) => [q.code, q]));
    expect(parCode.passer_au_bureau).toMatchObject({
      progress: 1,
      target: 1,
      completedAt: p.maintenant(),
      claimedAt: null,
      rewardCash: 500,
    });
    expect(parCode.reperage).toMatchObject({
      description: 'Consulte 5 fiches de communes.',
      difficulty: 'facile',
      eventType: 'territory_visited',
      target: 5,
      progress: 0,
      completedAt: null,
      rewardCash: 800,
      rewardGems: 0,
    });
  });

  it('à minuit (heure de Paris), de nouvelles quêtes ; une récompense d’hier se réclame encore', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, reperage: 5, cap_outre_mer: 2 });
    const hier = await p.quete('passer_au_bureau');
    const minuit = prochainMinuitParis(p.maintenant());

    p.avancer(minuit - 1 - p.maintenant());
    expect((await p.quetes()).quests.map((q) => q.id)).toContain(hier.id);
    p.avancer(1);
    const aujourdhui = await p.quetes();

    expect(aujourdhui.date).toBe(jourParis(minuit));
    expect(aujourdhui.resetsAt).toBeGreaterThan(minuit);
    expect(aujourdhui.quests).toHaveLength(3);
    expect(aujourdhui.quests.map((q) => q.id)).not.toContain(hier.id);
    expect((await p.reclamer(hier.id)).statusCode).toBe(200);
  });

  it('sans connexion : 401', async () => {
    const p = await partie();
    const reponse = await p.app.inject({ method: 'GET', url: '/api/v1/me/quests' });
    expect(reponse.statusCode).toBe(401);
  });
});

describe('ce qui fait avancer les quêtes', () => {
  it('un chantier compte quand il est fini (pas au lancement) ; annulé, il ne compte pas', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, encaisser: 2, chantiers: 2 });
    expect((await p.requete('POST', '/territories/01001/buy')).statusCode).toBe(200);
    p.sql('UPDATE users SET cash = 100000 WHERE id = ?', p.alice.id);
    const lancer = async () => (await p.construire()).building;

    const premier = await lancer();
    expect((await p.quete('chantiers')).progress).toBe(0);
    p.avancer((premier.worksEndsAt ?? 0) - p.maintenant());
    expect((await p.quete('chantiers')).progress).toBe(1);

    const annule = await lancer();
    expect((await p.requete('POST', `/buildings/${annule.id}/cancel`)).statusCode).toBe(200);
    expect((await p.quete('chantiers')).progress).toBe(1);

    const second = await lancer();
    p.avancer((second.worksEndsAt ?? 0) - p.maintenant());
    const finie = await p.quete('chantiers');

    expect(finie).toMatchObject({ progress: 2, target: 2, completedAt: p.maintenant(), claimedAt: null });
    expect(p.messages()).toEqual([
      { questId: finie.id, code: 'chantiers', title: 'Chef de chantier', rewardCash: 1_500, rewardGems: 0 },
    ]);
  });

  it('une amélioration finie fait avancer « Modernisation » et « Chef de chantier »', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, chantiers: 3, modernisation: 1 });
    p.sql('UPDATE daily_quests SET difficulty = ? WHERE code = ?', 'difficile', 'modernisation');
    expect((await p.requete('POST', '/territories/01001/buy')).statusCode).toBe(200);
    p.sql('UPDATE users SET cash = 100000 WHERE id = ?', p.alice.id);
    const { building } = await p.construire();
    p.avancer((building.worksEndsAt ?? 0) - p.maintenant());
    expect((await p.quete('modernisation')).progress).toBe(0);

    const amelioration = chantierReponseSchema.parse(
      (await p.requete('POST', `/buildings/${building.id}/upgrade`)).json(),
    );
    p.avancer((amelioration.building.worksEndsAt ?? 0) - p.maintenant());

    expect(await p.quete('modernisation')).toMatchObject({ progress: 1, completedAt: p.maintenant() });
    expect((await p.quete('chantiers')).progress).toBe(2);
  });

  it('« Trésorier » : seul le clic Encaisser compte, une fois par heure, s’il y a quelque chose à prendre', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, encaisser: 2, chantiers: 1 });
    expect((await p.requete('POST', '/territories/01001/buy')).statusCode).toBe(200);

    expect((await p.requete('POST', '/me/collect')).json().collected).toBe(0);
    expect((await p.quete('encaisser')).progress).toBe(0);

    p.avancer(h);
    expect((await p.requete('POST', '/me/collect')).json().collected).toBeGreaterThan(0);
    expect((await p.quete('encaisser')).progress).toBe(1);

    p.avancer(h / 2);
    expect((await p.requete('POST', '/me/collect')).json().collected).toBeGreaterThan(0);
    p.avancer(h / 4);
    expect((await p.requete('GET', '/me')).statusCode).toBe(200);
    expect((await p.quete('encaisser')).progress).toBe(1);

    p.avancer(h);
    expect((await p.requete('POST', '/me/collect')).json().collected).toBeGreaterThan(0);
    expect(await p.quete('encaisser')).toMatchObject({ progress: 2, completedAt: p.maintenant() });
  });

  it('achat d’une commune, OPA lancée et OPA défendue', async () => {
    const p = await partie();
    p.sql(`INSERT INTO daily_quests (code, title, description, event_type, target_min, target_max, difficulty,
      reward_income_hours, reward_cash_min, reward_gems, min_territories, weight)
      VALUES ('rempart', 'Rempart', 'Défends une commune.', 'takeover_defended', 1, 1, 'moyen', 2.5, 1500, 0, 0, 10)`);
    p.sql('UPDATE daily_quests SET min_territories = 0');

    // Bruno achète : sa quête « Expansion » est réussie par l'achat même qui l'a fait tirer.
    p.activer({ passer_au_bureau: 1, rempart: 1, expansion: 1 });
    expect((await p.requete('POST', '/territories/01002/buy', { cookie: p.bruno.cookie })).statusCode).toBe(200);
    expect(await p.quete('expansion', p.bruno.cookie)).toMatchObject({ progress: 1, completedAt: p.maintenant() });

    // Alice (quêtes tirées à son OPA, avec « Raider ») vise la commune de Bruno, qui la défend.
    p.activer({ passer_au_bureau: 1, rempart: 1, raider: 1 });
    p.sql('UPDATE users SET created_at = unixepoch() - 8 * 86400, newbie_shield_until = unixepoch() - 1');
    p.sql('UPDATE users SET cash = 100000');
    p.sql('UPDATE territories SET shield_until = NULL'); // bouclier posé à l'achat
    const opa = await p.requete('POST', '/territories/01002/takeovers');
    expect(opa.statusCode).toBe(200);
    expect((await p.quete('raider')).progress).toBe(1);
    const defense = await p.requete('POST', `/takeovers/${opa.json().takeover.id}/defend`, { cookie: p.bruno.cookie });
    expect(defense.statusCode).toBe(200);
    expect((await p.quete('rempart', p.bruno.cookie)).progress).toBe(1);
  });

  it('le bus refuse un événement hors de la transaction de l’action', async () => {
    const p = await partie();
    expect(() => emettre(p.db, { userId: p.alice.id, type: 'login' }, p.maintenant())).toThrow(/transaction/);
  });
});

describe('POST /me/quests/:id/claim', () => {
  it('verse la récompense une seule fois, avec une ligne quest_reward', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, reperage: 5, cap_outre_mer: 2 });
    const bureau = await p.quete('passer_au_bureau');
    const avant = p.cash();

    const reponse = await p.reclamer(bureau.id);

    expect(reponse.statusCode).toBe(200);
    const corps = reclamerQueteReponseSchema.parse(reponse.json());
    expect(corps.quest).toMatchObject({ id: bureau.id, claimedAt: p.maintenant() });
    expect(corps.wallet.cash).toBe(avant + 500);
    expect(p.cash()).toBe(avant + 500);
    expect(
      p.db.prepare("SELECT amount, ref_type, ref_id FROM wallet_transactions WHERE reason = 'quest_reward'").all(),
    ).toEqual([{ amount: 500, ref_type: 'user_quest', ref_id: bureau.id }]);

    const encore = await p.reclamer(bureau.id);
    expect(encore.statusCode).toBe(409);
    expect(encore.json().error).toMatchObject({ code: 'QUEST_NOT_CLAIMABLE', details: { reason: 'already_claimed' } });
    expect(p.cash()).toBe(avant + 500);
  });

  it('les gemmes aussi, dans une seconde ligne', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, reperage: 5, cap_outre_mer: 2 });
    p.sql("UPDATE daily_quests SET reward_gems = 2 WHERE code = 'passer_au_bureau'");
    const bureau = await p.quete('passer_au_bureau');

    const corps = reclamerQueteReponseSchema.parse((await p.reclamer(bureau.id, 'gemmes-1')).json());

    expect(corps.wallet.gems).toBe(2);
    expect(
      p.db.prepare("SELECT currency, amount FROM wallet_transactions WHERE reason = 'quest_reward' ORDER BY id").all(),
    ).toEqual([
      { currency: 'cash', amount: 500 },
      { currency: 'gems', amount: 2 },
    ]);
  });

  it('pas encore réussie : 409 ; quête d’un autre ou inconnue : 404', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, reperage: 5, cap_outre_mer: 2 });
    const reperage = await p.quete('reperage');
    const deBruno = await p.quete('passer_au_bureau', p.bruno.cookie);

    const pasFinie = await p.reclamer(reperage.id);
    expect(pasFinie.statusCode).toBe(409);
    expect(pasFinie.json().error).toMatchObject({ code: 'QUEST_NOT_CLAIMABLE', details: { reason: 'not_completed' } });
    expect((await p.reclamer(deBruno.id)).statusCode).toBe(404);
    expect((await p.reclamer(999_999)).statusCode).toBe(404);
    expect((await p.reclamer(0)).statusCode).toBe(400);
  });

  it('la même clé Idempotency-Key rejoue la réponse sans payer deux fois', async () => {
    const p = await partie();
    p.activer({ passer_au_bureau: 1, reperage: 5, cap_outre_mer: 2 });
    const bureau = await p.quete('passer_au_bureau');
    const reperage = await p.quete('reperage');
    const avant = p.cash();

    const une = await p.reclamer(bureau.id, 'quete-cle-1');
    const deux = await p.reclamer(bureau.id, 'quete-cle-1');
    const autre = await p.reclamer(reperage.id, 'quete-cle-1');

    expect(une.statusCode).toBe(200);
    expect(deux.statusCode).toBe(200);
    expect(deux.json()).toEqual(une.json());
    expect(autre.statusCode).toBe(400);
    expect(p.cash()).toBe(avant + 500);
  });
});
