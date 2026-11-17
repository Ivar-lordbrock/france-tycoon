import {
  BOUCLIER_DEFENSE_S,
  BOUCLIER_OPA_REUSSIE_S,
  contenuOpaTermineeSchema,
  DELAI_REPONSE_OPA_S,
  detailOpaReponseSchema,
  ficheCommuneSchema,
  mesOpaReponseSchema,
  opaReponseSchema,
} from '@france-tycoon/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creerTaches, executerTache } from '../../jobs/taches.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

const jour = 86_400;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Math.floor(Date.now() / 1000) * 1000);
});
afterEach(() => vi.useRealTimers());

const maintenant = () => Math.floor(Date.now() / 1000);
const avancer = (secondes: number) => vi.setSystemTime(Date.now() + secondes * 1000);

/**
 * Alice (100 000 ₮) lance une OPA sur le village de Bruno (V_T 21 800 ₮) : offre 32 700, défense 7 700,
 * indemnité 1 700. Revenus remis à zéro au lancement pour des comptes exacts.
 */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const carla = await connecter(app, 'Carla');
  const sql = (requete: string, ...valeurs: unknown[]) => db.prepare(requete).run(...valeurs);
  sql(
    'UPDATE users SET created_at = ?, newbie_shield_until = 0, income_collected_at = ?, income_remainder = 0',
    maintenant() - 8 * jour,
    maintenant(),
  );
  sql("UPDATE users SET cash = 100000 WHERE pseudo IN ('Alice', 'Carla')");
  sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01001'", bruno.id);

  const requete = (methode: 'GET' | 'POST', url: string, cookie?: string, cle?: string) =>
    app.inject({
      method: methode,
      url: `/api/v1${url}`,
      headers: { ...(cookie ? { cookie } : {}), ...(cle ? { 'idempotency-key': cle } : {}) },
    });
  const lancer = async (insee = '01001', cookie = alice.cookie) => {
    const reponse = await requete('POST', `/territories/${insee}/takeovers`, cookie);
    expect(reponse.statusCode).toBe(200);
    return opaReponseSchema.parse(reponse.json()).takeover;
  };
  const repondre = (id: number, action: 'defend' | 'accept' | 'cancel', cookie: string, cle?: string) =>
    requete('POST', `/takeovers/${id}/${action}`, cookie, cle);
  const mouvements = (userId: number, raison: string) =>
    db
      .prepare('SELECT amount FROM wallet_transactions WHERE user_id = ? AND reason = ? ORDER BY id')
      .pluck()
      .all(userId, raison);
  const commune = (insee = '01001') =>
    db
      .prepare(
        `SELECT owner_id AS ownerId, shield_until AS shieldUntil, fortification_value AS fortification,
          acquired_price AS acquiredPrice FROM territories WHERE insee_code = ?`,
      )
      .get(insee) as { ownerId: number; shieldUntil: number | null; fortification: number; acquiredPrice: number };
  const messages = (userId: number) =>
    (
      db
        .prepare("SELECT payload FROM notifications WHERE user_id = ? AND kind = 'takeover_resolved' ORDER BY id")
        .pluck()
        .all(userId) as string[]
    ).map((p) => contenuOpaTermineeSchema.parse(JSON.parse(p)));
  return { db, app, alice, bruno, carla, sql, requete, lancer, repondre, mouvements, commune, messages };
}

describe('défendre (POST /takeovers/:id/defend)', () => {
  it('le défenseur paie la défense, garde sa commune, reçoit l’indemnité ; bouclier 72 h', async () => {
    const { alice, bruno, lancer, repondre, mouvements, commune, messages, requete } = await partie();
    const opa = await lancer();
    avancer(3_600);

    const reponse = await repondre(opa.id, 'defend', bruno.cookie);

    expect(reponse.statusCode).toBe(200);
    const { takeover } = opaReponseSchema.parse(reponse.json());
    expect(takeover).toMatchObject({ status: 'defended', role: 'defender', resolvedAt: maintenant() });
    expect(mouvements(bruno.id, 'takeover_defense')).toEqual([-7_700]);
    expect(mouvements(bruno.id, 'takeover_break_fee')).toEqual([1_700]);
    expect(mouvements(alice.id, 'takeover_refund')).toEqual([31_000]); // offre − indemnité
    expect(commune()).toMatchObject({
      ownerId: bruno.id,
      fortification: 7_700,
      shieldUntil: maintenant() + BOUCLIER_DEFENSE_S,
    });
    expect(messages(alice.id)).toEqual([
      {
        takeoverId: opa.id,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        status: 'defended',
        role: 'attacker',
        otherPseudo: 'Bruno',
      },
    ]);
    expect(messages(bruno.id)).toEqual([]);

    // La prochaine OPA coûtera plus cher (V_T + D) et Alice doit attendre 7 jours.
    avancer(BOUCLIER_DEFENSE_S);
    const devis = (await requete('GET', '/territories/01001/takeover-quote', alice.cookie)).json();
    expect(devis).toMatchObject({ territoryValue: 29_500, reasons: ['TAKEOVER_COOLDOWN'] });
  });

  it('pas assez de cash pour se défendre : l’OPA reste en cours', async () => {
    const { bruno, sql, lancer, repondre } = await partie();
    const opa = await lancer();
    sql('UPDATE users SET cash = 5000 WHERE id = ?', bruno.id);

    const reponse = await repondre(opa.id, 'defend', bruno.cookie);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error).toMatchObject({ code: 'INSUFFICIENT_FUNDS', details: { missing: 2_700 } });
    expect(
      opaReponseSchema.shape.takeover.parse(
        (await repondre(opa.id, 'accept', bruno.cookie)).json().takeover, // il peut encore accepter
      ).status,
    ).toBe('accepted');
  });

  it('même clé Idempotency-Key : défense payée une seule fois', async () => {
    const { bruno, lancer, repondre, mouvements } = await partie();
    const opa = await lancer();

    const premiere = await repondre(opa.id, 'defend', bruno.cookie, 'defense-village');
    const rejouee = await repondre(opa.id, 'defend', bruno.cookie, 'defense-village');

    expect(premiere.statusCode).toBe(200);
    expect(rejouee.statusCode).toBe(200);
    expect(rejouee.json().takeover.status).toBe('defended');
    expect(mouvements(bruno.id, 'takeover_defense')).toEqual([-7_700]);
  });
});

describe('accepter (POST /takeovers/:id/accept)', () => {
  it('le défenseur vend tout de suite : il reçoit l’offre, la commune passe avec ses bâtiments ; bouclier 48 h', async () => {
    const { db, alice, bruno, lancer, repondre, mouvements, commune, messages, requete } = await partie();
    db.exec(`
      INSERT INTO buildings (territory_id, building_type_id, level, invested_cash)
      SELECT t.id, bt.id, 1, 4430 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01001' AND bt.code = 'residence'`);
    const opa = await lancer(); // V_T = 26 230 avec la Résidence : offre 39 400

    const reponse = await repondre(opa.id, 'accept', bruno.cookie);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().takeover).toMatchObject({ status: 'accepted', resolvedAt: maintenant() });
    expect(mouvements(bruno.id, 'takeover_payout')).toEqual([39_400]);
    expect(mouvements(alice.id, 'takeover_escrow')).toEqual([-39_400]); // rien de plus chez l'attaquant
    expect(commune()).toMatchObject({
      ownerId: alice.id,
      acquiredPrice: 39_400,
      shieldUntil: maintenant() + BOUCLIER_OPA_REUSSIE_S,
    });
    expect(messages(alice.id).map((m) => m.status)).toEqual(['accepted']);
    const historique = db
      .prepare(
        'SELECT reason, from_user_id AS de, to_user_id AS vers, price, takeover_id AS opa FROM territory_ownership_history',
      )
      .all();
    expect(historique).toEqual([{ reason: 'takeover', de: bruno.id, vers: alice.id, price: 39_400, opa: opa.id }]);
    expect(messages(bruno.id)).toEqual([]);

    const fiche = ficheCommuneSchema.parse((await requete('GET', '/territories/01001', alice.cookie)).json());
    expect(fiche).toMatchObject({ state: 'mine', takeover: null, buildings: [{ typeCode: 'residence', level: 1 }] });
  });
});

describe('retirer (POST /takeovers/:id/cancel)', () => {
  it('l’attaquant récupère son offre moins l’indemnité, versée au défenseur ; 7 jours d’attente', async () => {
    const { alice, bruno, lancer, repondre, mouvements, commune, messages, requete } = await partie();
    const opa = await lancer();

    const reponse = await repondre(opa.id, 'cancel', alice.cookie);

    expect(reponse.statusCode).toBe(200);
    expect(opaReponseSchema.parse(reponse.json())).toMatchObject({
      takeover: { status: 'cancelled', role: 'attacker' },
      wallet: { cash: 100_000 - 1_700 },
    });
    expect(mouvements(alice.id, 'takeover_refund')).toEqual([31_000]);
    expect(mouvements(bruno.id, 'takeover_break_fee')).toEqual([1_700]);
    expect(commune()).toMatchObject({ ownerId: bruno.id, fortification: 0, shieldUntil: null });
    expect(messages(bruno.id).map((m) => [m.status, m.role, m.otherPseudo])).toEqual([
      ['cancelled', 'defender', 'Alice'],
    ]);
    const devis = (await requete('GET', '/territories/01001/takeover-quote', alice.cookie)).json();
    expect(devis.reasons).toEqual(['TAKEOVER_COOLDOWN']);
  });
});

describe('24 h sans réponse', () => {
  it('la commune passe à l’attaquant à la lecture ; chacun touche les revenus pour son temps', async () => {
    const { db, alice, bruno, lancer, mouvements, commune, messages, requete } = await partie();
    const opa = await lancer();
    expect(opa.expiresAt).toBe(maintenant() + DELAI_REPONSE_OPA_S);
    avancer(30 * 3_600);

    const reponse = await requete('GET', `/takeovers/${opa.id}`, alice.cookie);

    expect(reponse.statusCode).toBe(200);
    expect(detailOpaReponseSchema.parse(reponse.json()).takeover).toMatchObject({
      status: 'succeeded',
      resolvedAt: opa.expiresAt,
    });
    expect(mouvements(bruno.id, 'takeover_payout')).toEqual([32_700]);
    expect(commune()).toMatchObject({ ownerId: alice.id, shieldUntil: opa.expiresAt + BOUCLIER_OPA_REUSSIE_S });
    // Les deux sont prévenus.
    expect(messages(alice.id).map((m) => [m.status, m.role])).toEqual([['succeeded', 'attacker']]);
    expect(messages(bruno.id).map((m) => [m.status, m.role])).toEqual([['succeeded', 'defender']]);

    // Bruno touche le village (218 ₮/h) pendant les 24 h, Alice pendant les 6 h suivantes.
    expect(mouvements(bruno.id, 'income_collect')).toEqual([24 * 218]);
    await requete('GET', '/me', alice.cookie);
    expect(mouvements(alice.id, 'income_collect')).toEqual([6 * 218]);
    const derniere = db
      .prepare("SELECT metadata FROM wallet_transactions WHERE user_id = ? AND reason = 'income_collect'")
      .pluck()
      .get(bruno.id) as string;
    expect(JSON.parse(derniere)).toMatchObject({ until: opa.expiresAt });
  });

  it('n’importe quelle lecture la résout : fiche de la commune, /me d’un autre joueur', async () => {
    const { alice, carla, lancer, commune, requete } = await partie();
    await lancer();
    avancer(DELAI_REPONSE_OPA_S);

    await requete('GET', '/me', carla.cookie); // Carla n'a rien à voir avec cette OPA
    expect(commune().ownerId).toBe(alice.id);
  });

  it('la fiche montre le nouveau propriétaire sans attendre la tâche', async () => {
    const { alice, lancer, requete } = await partie();
    await lancer();
    avancer(DELAI_REPONSE_OPA_S + 1);

    const fiche = ficheCommuneSchema.parse((await requete('GET', '/territories/01001')).json());

    expect(fiche).toMatchObject({ state: 'shield', owner: { pseudo: 'Alice' }, takeover: null });
    expect(alice.id).toBeGreaterThan(0);
  });

  it('trop tard pour se défendre : TAKEOVER_NOT_PENDING, rien n’est payé', async () => {
    const { alice, bruno, lancer, repondre, mouvements, commune } = await partie();
    const opa = await lancer();
    avancer(DELAI_REPONSE_OPA_S);

    const reponse = await repondre(opa.id, 'defend', bruno.cookie);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error).toMatchObject({ code: 'TAKEOVER_NOT_PENDING', details: { status: 'succeeded' } });
    expect(mouvements(bruno.id, 'takeover_defense')).toEqual([]);
    expect(commune().ownerId).toBe(alice.id);
  });
});

describe('qui peut répondre', () => {
  it('rôle attendu, OPA d’un autre invisible, réponse en double refusée', async () => {
    const { alice, bruno, carla, lancer, repondre, requete } = await partie();
    const opa = await lancer();

    const defenseParAlice = await repondre(opa.id, 'defend', alice.cookie);
    const retraitParBruno = await repondre(opa.id, 'cancel', bruno.cookie);
    const vueDeCarla = await requete('GET', `/takeovers/${opa.id}`, carla.cookie);
    const visiteur = await requete('GET', `/takeovers/${opa.id}`);
    const inconnue = await repondre(9_999, 'accept', bruno.cookie);

    expect(defenseParAlice.statusCode).toBe(403);
    expect(retraitParBruno.statusCode).toBe(403);
    expect(vueDeCarla.statusCode).toBe(404);
    expect(visiteur.statusCode).toBe(401);
    expect(inconnue.statusCode).toBe(404);

    expect((await repondre(opa.id, 'accept', bruno.cookie)).statusCode).toBe(200);
    const encore = await repondre(opa.id, 'cancel', alice.cookie);
    expect(encore.statusCode).toBe(409);
    expect(encore.json().error.code).toBe('TAKEOVER_NOT_PENDING');
  });
});

describe('deux OPA en même temps', () => {
  it('Bruno défend l’une, laisse filer l’autre : la tâche résout seulement celle qui reste', async () => {
    const { db, alice, bruno, carla, sql, lancer, repondre, commune, mouvements } = await partie();
    sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01004'", bruno.id);
    const opaAlice = await lancer('01001', alice.cookie);
    avancer(60);
    const opaCarla = await lancer('01004', carla.cookie);

    expect((await repondre(opaCarla.id, 'defend', bruno.cookie)).statusCode).toBe(200);
    avancer(DELAI_REPONSE_OPA_S);
    const [tache] = creerTaches(db);
    if (!tache) throw new Error('pas de tâche');
    expect(executerTache(db, tache, maintenant())).toBe(true);

    expect(commune('01001').ownerId).toBe(alice.id);
    expect(commune('01004')).toMatchObject({ ownerId: bruno.id, fortification: 10_500 });
    expect(mouvements(bruno.id, 'takeover_payout')).toEqual([32_700]);
    expect(mouvements(carla.id, 'takeover_refund')).toEqual([45_000 - 2_300]);
    const statuts = db.prepare('SELECT status FROM takeovers ORDER BY id').pluck().all();
    expect(statuts).toEqual(['succeeded', 'defended']);
    expect(opaAlice.id).toBeLessThan(opaCarla.id);
  });

  it('deux OPA échues résolues dans l’ordre de leur fin', async () => {
    const { db, alice, bruno, carla, sql, lancer, commune, requete } = await partie();
    sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01004'", bruno.id);
    await lancer('01004', carla.cookie);
    avancer(60);
    await lancer('01001', alice.cookie);
    avancer(DELAI_REPONSE_OPA_S);

    await requete('GET', '/me', bruno.cookie);

    expect(commune('01001').ownerId).toBe(alice.id);
    expect(commune('01004').ownerId).toBe(carla.id);
    const fins = db.prepare('SELECT resolved_at FROM takeovers ORDER BY resolved_at').pluck().all() as number[];
    expect(fins.map((fin) => fin - (fins[0] ?? 0))).toEqual([0, 60]);
  });
});

describe('GET /me/takeovers', () => {
  it('mes OPA, filtrées par rôle et statut, les plus récentes d’abord', async () => {
    const { alice, bruno, carla, sql, lancer, repondre, requete } = await partie();
    sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01004'", bruno.id);
    const premiere = await lancer('01001', alice.cookie);
    await repondre(premiere.id, 'cancel', alice.cookie);
    avancer(60);
    const seconde = await lancer('01004', carla.cookie);

    const liste = async (requeteUrl: string, cookie: string) =>
      mesOpaReponseSchema.parse((await requete('GET', requeteUrl, cookie)).json()).takeovers.map((o) => o.id);

    expect(await liste('/me/takeovers', bruno.cookie)).toEqual([seconde.id, premiere.id]);
    expect(await liste('/me/takeovers?status=pending', bruno.cookie)).toEqual([seconde.id]);
    expect(await liste('/me/takeovers?role=attacker', bruno.cookie)).toEqual([]);
    expect(await liste('/me/takeovers?role=attacker', alice.cookie)).toEqual([premiere.id]);
    expect((await requete('GET', '/me/takeovers?status=perdue', bruno.cookie)).statusCode).toBe(400);
  });
});

describe('tâche resolve-takeovers', () => {
  it('laisse une ligne dans job_runs, ne tourne pas deux fois en même temps, oublie après 7 jours', async () => {
    const { db, lancer } = await partie();
    await lancer();
    avancer(DELAI_REPONSE_OPA_S);
    const [tache] = creerTaches(db);
    if (!tache) throw new Error('pas de tâche');
    db.prepare("INSERT INTO job_runs (job_name, started_at, finished_at, status) VALUES (?, ?, ?, 'ok')").run(
      tache.nom,
      maintenant() - 8 * jour,
      maintenant() - 8 * jour,
    );

    expect(executerTache(db, tache, maintenant())).toBe(true);
    const lignes = db.prepare('SELECT status, details FROM job_runs WHERE job_name = ?').all(tache.nom);
    expect(lignes).toEqual([{ status: 'ok', details: '{"resolved":1}' }]);

    db.prepare("INSERT INTO job_runs (job_name, status) VALUES (?, 'running')").run(tache.nom);
    expect(executerTache(db, tache, maintenant())).toBe(false);
  });
});
