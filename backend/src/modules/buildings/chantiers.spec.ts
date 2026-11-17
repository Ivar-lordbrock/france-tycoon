import {
  annulationReponseSchema,
  capitaleReponseSchema,
  chantierReponseSchema,
  DELAI_DEPLACEMENT_CAPITALE_S,
  DUREE_CHANTIER_TUTORIEL_S,
  demolitionReponseSchema,
  ficheCommuneSchema,
  fileConstructionSchema,
  moiReponseSchema,
} from '@france-tycoon/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

// Bâtiments en temps simulé (docs/05-equilibrage.md, 5.2). Village 01001 : V0 = 21 800, f_T = 1,48, 3 emplacements.
// Résidence au village : 4 430 ₮ (10 min) au niveau 1, 8 860 ₮ (20 min) au niveau 2. Siège : 40 000 puis 100 000 ₮.

const h = 3_600;

afterEach(() => {
  vi.useRealTimers();
});

/** Une partie à l'horloge figée : Alice possède le village 01001 et a 100 000 ₮. */
async function partie() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Math.floor(Date.now() / 1000) * 1000);
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 12_000 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 200_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const maintenant = () => Math.floor(Date.now() / 1000);
  const avancer = (secondes: number) => vi.setSystemTime(Date.now() + secondes * 1000);
  const requete = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    options: { payload?: object; cookie?: string; cle?: string } = {},
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: options.cookie ?? alice.cookie, ...(options.cle ? { 'idempotency-key': options.cle } : {}) },
      ...(options.payload ? { payload: options.payload } : {}),
    });
  const cash = () => db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(alice.id) as number;
  const donnerCash = (montant: number) => db.prepare('UPDATE users SET cash = ? WHERE id = ?').run(montant, alice.id);
  const construire = (typeCode: string, insee = '01001', options: { cookie?: string; cle?: string } = {}) =>
    requete('POST', `/territories/${insee}/buildings`, { ...options, payload: { typeCode } });
  const fiche = async (insee: string) =>
    ficheCommuneSchema.parse((await requete('GET', `/territories/${insee}`)).json());

  expect((await requete('POST', '/territories/01001/buy')).statusCode).toBe(200);
  donnerCash(100_000);
  return { db, app, alice, bruno, maintenant, avancer, requete, cash, donnerCash, construire, fiche };
}

/** Construit un bâtiment et attend la fin du chantier (premier chantier du tutoriel : 10 s). */
async function construitEtFini(p: Awaited<ReturnType<typeof partie>>, typeCode: string, insee = '01001') {
  const reponse = await p.construire(typeCode, insee);
  expect(reponse.statusCode).toBe(200);
  const { building } = chantierReponseSchema.parse(reponse.json());
  p.avancer((building.worksEndsAt ?? 0) - p.maintenant());
  return building.id;
}

describe('construire', () => {
  it('une Résidence : payée, 10 s pour le premier chantier (tutoriel), puis niveau 1 et revenu', async () => {
    const p = await partie();
    const avant = p.cash();

    const reponse = await p.construire('residence');

    expect(reponse.statusCode).toBe(200);
    const { building, wallet } = chantierReponseSchema.parse(reponse.json());
    expect(building).toMatchObject({
      territoryInsee: '01001',
      typeCode: 'residence',
      name: 'Résidence',
      level: 0,
      targetLevel: 1,
      worksStartedAt: p.maintenant(),
      worksEndsAt: p.maintenant() + DUREE_CHANTIER_TUTORIEL_S,
      investedCash: 4_430,
      incomePerHour: 0,
    });
    expect(wallet.cash).toBe(avant - 4_430);
    expect(
      p.db
        .prepare("SELECT amount, ref_type, ref_id FROM wallet_transactions WHERE reason = 'building_construction'")
        .get(),
    ).toEqual({ amount: -4_430, ref_type: 'building', ref_id: building.id });

    p.avancer(DUREE_CHANTIER_TUTORIEL_S);
    const moi = moiReponseSchema.parse((await p.requete('GET', '/me')).json());

    expect(moi.incomePerHour).toBe(218 + 295);
    expect(moi.finishedWorks).toMatchObject([{ buildingId: building.id, level: 1 }]);
    expect((await p.fiche('01001')).buildings).toMatchObject([{ level: 1, targetLevel: null, worksEndsAt: null }]);
  });

  it('le deuxième chantier dure normalement ; une seule file de construction', async () => {
    const p = await partie();
    const premiere = await construitEtFini(p, 'residence');

    const seconde = chantierReponseSchema.parse((await p.construire('residence')).json()).building;
    const pleine = await p.requete('POST', `/buildings/${premiere}/upgrade`);

    expect(seconde.worksEndsAt).toBe(p.maintenant() + 600);
    expect(pleine.statusCode).toBe(409);
    expect(pleine.json().error).toMatchObject({ code: 'BUILD_QUEUE_FULL', details: { slots: 1 } });
    const file = fileConstructionSchema.parse((await p.requete('GET', '/me/construction-queue')).json());
    expect(file).toEqual({
      slots: 1,
      works: [
        {
          buildingId: seconde.id,
          territoryInsee: '01001',
          territoryName: 'L’Abergement-Clémenciat',
          typeCode: 'residence',
          name: 'Résidence',
          targetLevel: 1,
          startedAt: p.maintenant(),
          endsAt: p.maintenant() + 600,
          cost: 4_430,
        },
      ],
    });
  });

  it('refusé : commune d’un autre, type inconnu, emplacements, population, limites, argent', async () => {
    const p = await partie();
    const erreur = async (reponse: Awaited<ReturnType<typeof p.construire>>) => ({
      statut: reponse.statusCode,
      code: reponse.json().error?.code,
    });

    expect(await erreur(await p.construire('residence', '01002'))).toEqual({ statut: 403, code: 'FORBIDDEN' });
    expect(await erreur(await p.construire('residence', '01001', { cookie: p.bruno.cookie }))).toEqual({
      statut: 403,
      code: 'FORBIDDEN',
    });
    expect(await erreur(await p.construire('chateau'))).toEqual({ statut: 404, code: 'NOT_FOUND' });
    expect(await erreur(await p.construire('residence', '99999'))).toEqual({
      statut: 404,
      code: 'TERRITORY_NOT_FOUND',
    });
    // L'usine demande 1 000 habitants : le village en a 859.
    expect(await erreur(await p.construire('usine'))).toEqual({ statut: 409, code: 'BUILDING_REQUIREMENT' });

    await construitEtFini(p, 'equipement');
    expect(await erreur(await p.construire('equipement'))).toEqual({ statut: 409, code: 'BUILDING_REQUIREMENT' });

    // Siège social : un seul par joueur. Il prend 2 emplacements : le village (3) est alors plein.
    await construitEtFini(p, 'siege_social');
    expect(await erreur(await p.construire('residence'))).toEqual({ statut: 409, code: 'NO_FREE_SLOT' });
    p.db.prepare("UPDATE territories SET owner_id = ? WHERE insee_code = '01004'").run(p.alice.id);
    expect(await erreur(await p.construire('siege_social', '01004'))).toEqual({
      statut: 409,
      code: 'BUILDING_REQUIREMENT',
    });

    await p.requete('GET', '/me/construction-queue'); // encaisse l'heure de revenu en attente
    p.donnerCash(100);
    const pauvre = await p.construire('residence', '01004');
    expect(pauvre.statusCode).toBe(409);
    // Résidence à Ambérieu (V0 = 200 000, f_T = 4,47) : 13 420 ₮.
    expect(pauvre.json().error).toMatchObject({ code: 'INSUFFICIENT_FUNDS', details: { missing: 13_420 - 100 } });
    expect(p.db.prepare('SELECT count(*) FROM buildings').pluck().get()).toBe(2); // rien n'est resté à moitié fait
  });

  it('la même clé Idempotency-Key ne paie qu’une fois', async () => {
    const p = await partie();
    const avant = p.cash();

    const premier = await p.construire('residence', '01001', { cle: 'chantier-0001' });
    const rejoue = await p.construire('residence', '01001', { cle: 'chantier-0001' });

    expect(rejoue.statusCode).toBe(200);
    expect(rejoue.json().building.id).toBe(premier.json().building.id);
    expect(p.cash()).toBe(avant - 4_430);
    expect(p.db.prepare('SELECT count(*) FROM buildings').pluck().get()).toBe(1);
  });
});

describe('améliorer, annuler, démolir', () => {
  it('améliorer : prix du niveau 2 ; le bâtiment produit au niveau 1 pendant le chantier', async () => {
    const p = await partie();
    const id = await construitEtFini(p, 'residence');
    p.donnerCash(20_000);

    const reponse = await p.requete('POST', `/buildings/${id}/upgrade`);
    const encore = await p.requete('POST', `/buildings/${id}/upgrade`);

    const { building, wallet } = chantierReponseSchema.parse(reponse.json());
    expect(building).toMatchObject({
      level: 1,
      targetLevel: 2,
      worksEndsAt: p.maintenant() + 1_200,
      investedCash: 4_430 + 8_860,
      incomePerHour: 295,
    });
    expect(wallet.cash).toBe(20_000 - 8_860);
    expect(encore.json().error.code).toBe('WORKS_IN_PROGRESS');

    p.avancer(1_200);
    const moi = moiReponseSchema.parse((await p.requete('GET', '/me')).json());
    expect(moi.incomePerHour).toBe(218 + 502);
    // 20 min à 513 ₮/h encaissées au passage : 171 ₮.
    expect(moi.wallet.cash).toBe(20_000 - 8_860 + 171);
  });

  it('niveau 5 : plus d’amélioration possible', async () => {
    const p = await partie();
    const id = await construitEtFini(p, 'residence');
    p.db
      .prepare(
        `UPDATE buildings SET level = 5, target_level = NULL, works_started_at = NULL, works_ends_at = NULL,
          works_cost = NULL WHERE id = ?`,
      )
      .run(id);

    const reponse = await p.requete('POST', `/buildings/${id}/upgrade`);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error.code).toBe('BUILDING_REQUIREMENT');
  });

  it('annuler une amélioration : tout est rendu, le bâtiment garde son niveau', async () => {
    const p = await partie();
    const id = await construitEtFini(p, 'residence');
    p.donnerCash(20_000);
    await p.requete('POST', `/buildings/${id}/upgrade`);

    const reponse = await p.requete('POST', `/buildings/${id}/cancel`);
    const rien = await p.requete('POST', `/buildings/${id}/cancel`);

    expect(annulationReponseSchema.parse(reponse.json())).toMatchObject({
      building: { id, level: 1, targetLevel: null, worksEndsAt: null, investedCash: 4_430 },
      refunded: 8_860,
      wallet: { cash: 20_000 },
    });
    expect(rien.statusCode).toBe(409);
    expect(rien.json().error.code).toBe('NO_WORKS_IN_PROGRESS');
    expect(
      p.db
        .prepare("SELECT amount, metadata FROM wallet_transactions WHERE reason = 'building_upgrade' ORDER BY id")
        .all(),
    ).toEqual([
      { amount: -8_860, metadata: null },
      { amount: 8_860, metadata: JSON.stringify({ cancelled: true, targetLevel: 2 }) },
    ]);
  });

  it('annuler une première construction supprime le bâtiment ; un chantier déjà fini ne s’annule plus', async () => {
    const p = await partie();
    const avant = p.cash();
    const { building } = chantierReponseSchema.parse((await p.construire('residence')).json());

    const reponse = await p.requete('POST', `/buildings/${building.id}/cancel`);

    expect(annulationReponseSchema.parse(reponse.json())).toEqual({
      building: null,
      refunded: 4_430,
      wallet: { cash: avant, gems: 0 },
    });
    expect(p.db.prepare('SELECT count(*) FROM buildings').pluck().get()).toBe(0);

    const id = await construitEtFini(p, 'residence');
    const tard = await p.requete('POST', `/buildings/${id}/cancel`);
    expect(tard.json().error.code).toBe('NO_WORKS_IN_PROGRESS');
  });

  it('démolir : 30 % du cash investi rendus ; pas pendant un chantier ; pas chez un autre', async () => {
    const p = await partie();
    const id = await construitEtFini(p, 'residence');
    const avant = p.cash();

    expect((await p.requete('DELETE', `/buildings/${id}`, { cookie: p.bruno.cookie })).statusCode).toBe(403);
    const reponse = await p.requete('DELETE', `/buildings/${id}`);

    expect(demolitionReponseSchema.parse(reponse.json())).toEqual({
      refunded: 1_329,
      wallet: { cash: avant + 1_329, gems: 0 },
    });
    expect((await p.requete('DELETE', `/buildings/${id}`)).statusCode).toBe(404);

    const { building } = chantierReponseSchema.parse((await p.construire('residence')).json());
    const pendant = await p.requete('DELETE', `/buildings/${building.id}`);
    expect(pendant.json().error.code).toBe('WORKS_IN_PROGRESS');
  });
});

describe('siège social et capitale', () => {
  it('sa commune devient capitale dès le chantier ; +1 territoire par niveau quand il est fini', async () => {
    const p = await partie();
    p.donnerCash(500_000);

    const { building } = chantierReponseSchema.parse((await p.construire('siege_social')).json());

    expect(building.investedCash).toBe(40_000); // pas de facteur de taille pour le siège
    expect((await p.fiche('01001')).isCapital).toBe(true);
    expect((await p.fiche('01001')).actions.sellReasons).toEqual(['CAPITAL_IMMUNE']);

    p.avancer(DUREE_CHANTIER_TUTORIEL_S);
    expect(moiReponseSchema.parse((await p.requete('GET', '/me')).json()).territories.max).toBe(5);

    const niveau2 = chantierReponseSchema.parse((await p.requete('POST', `/buildings/${building.id}/upgrade`)).json());
    expect(niveau2.building.worksEndsAt).toBe(p.maintenant() + 2 * h);
    expect(niveau2.wallet.cash).toBe(500_000 - 40_000 - 100_000); // 10 s de revenu : moins d'un ₮, gardé en reste
    p.avancer(2 * h);
    expect(moiReponseSchema.parse((await p.requete('GET', '/me')).json()).territories.max).toBe(6);

    const demolir = await p.requete('DELETE', `/buildings/${building.id}`);
    expect(demolir.statusCode).toBe(409);
    expect(demolir.json().error.code).toBe('CAPITAL_IMMUNE');
  });

  it('annuler la première construction du siège enlève la capitale', async () => {
    const p = await partie();
    p.donnerCash(100_000);
    const { building } = chantierReponseSchema.parse((await p.construire('siege_social')).json());

    await p.requete('POST', `/buildings/${building.id}/cancel`);

    expect((await p.fiche('01001')).isCapital).toBe(false);
  });

  it('déplacer la capitale : le siège change de commune, une fois tous les 7 jours', async () => {
    const p = await partie();
    p.donnerCash(500_000);
    const deplacer = (insee: string) => p.requete('POST', '/me/capital', { payload: { insee } });

    expect((await deplacer('01001')).json().error.code).toBe('BUILDING_REQUIREMENT'); // pas encore de siège
    const siege = await construitEtFini(p, 'siege_social');
    expect((await deplacer('01002')).statusCode).toBe(403);
    expect((await p.requete('POST', '/territories/01002/buy')).statusCode).toBe(200);
    expect((await deplacer('01001')).statusCode).toBe(400); // déjà la capitale

    const reponse = await deplacer('01002');

    expect(capitaleReponseSchema.parse(reponse.json())).toEqual({
      capitalInsee: '01002',
      nextMoveAt: p.maintenant() + DELAI_DEPLACEMENT_CAPITALE_S,
    });
    expect((await p.fiche('01002')).isCapital).toBe(true);
    expect((await p.fiche('01002')).buildings).toMatchObject([{ id: siege, typeCode: 'siege_social', level: 1 }]);
    expect((await p.fiche('01001')).isCapital).toBe(false);
    expect((await p.fiche('01001')).buildings).toEqual([]);

    const tropTot = await deplacer('01001');
    expect(tropTot.statusCode).toBe(409);
    expect(tropTot.json().error).toMatchObject({
      code: 'CAPITAL_COOLDOWN',
      details: { nextMoveAt: p.maintenant() + DELAI_DEPLACEMENT_CAPITALE_S },
    });

    p.avancer(DELAI_DEPLACEMENT_CAPITALE_S);
    expect((await deplacer('01001')).statusCode).toBe(200);
  });

  it('déplacer la capitale : pas pendant un chantier du siège, pas sans place', async () => {
    const p = await partie();
    p.donnerCash(500_000);
    const siege = await construitEtFini(p, 'siege_social');
    await p.requete('POST', '/territories/01002/buy');
    await p.requete('POST', `/buildings/${siege}/upgrade`);

    const pendant = await p.requete('POST', '/me/capital', { payload: { insee: '01002' } });
    expect(pendant.json().error.code).toBe('WORKS_IN_PROGRESS');

    await p.requete('POST', `/buildings/${siege}/cancel`);
    p.db.exec(`
      INSERT INTO buildings (territory_id, building_type_id, level, invested_cash)
      SELECT t.id, bt.id, 1, 1 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01002' AND bt.code IN ('residence', 'commerce')`);
    const pasDePlace = await p.requete('POST', '/me/capital', { payload: { insee: '01002' } });
    expect(pasDePlace.json().error).toMatchObject({ code: 'NO_FREE_SLOT', details: { needed: 2, free: 1 } });
  });
});
