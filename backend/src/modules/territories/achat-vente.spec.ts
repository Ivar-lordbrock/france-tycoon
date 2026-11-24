import {
  achatReponseSchema,
  BOUCLIER_ACHAT_S,
  CAPITAL_DEPART,
  ficheCommuneSchema,
  mesTerritoiresSchema,
  prixVenteEtat,
  venteReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import type { Base } from '../../db/connexion.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

const VILLAGE = 21_800;

function baseAvecCommunes(): Base {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: VILLAGE },
    { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 12_000 },
    { insee: '75056', nom: 'Paris', departement: '75', population: 2_103_778, valeur: 34_886_300 },
    { insee: '97209', nom: 'Fort-de-France', departement: '972', zone: 'MQ', population: 76_000, valeur: 280_000 },
    { insee: '98735', nom: 'Papeete', departement: '987', zone: 'PF', population: 26_654, valeur: 777_400 },
  ]);
  return db;
}

async function partie() {
  const db = baseAvecCommunes();
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const action = (verbe: 'buy' | 'sell', insee: string, cookie?: string, cle?: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/territories/${insee}/${verbe}`,
      headers: { ...(cookie ? { cookie } : {}), ...(cle ? { 'idempotency-key': cle } : {}) },
    });
  const cash = (id: number) => db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(id) as number;
  const proprietaire = (insee: string) =>
    db.prepare('SELECT owner_id FROM territories WHERE insee_code = ?').pluck().get(insee) as number | null;
  const donner = (insee: string, id: number) =>
    db.prepare('UPDATE territories SET owner_id = ? WHERE insee_code = ?').run(id, insee);
  return { db, app, alice, bruno, action, cash, proprietaire, donner };
}

/** Une Résidence niveau 1 en chantier vers le niveau 2 (prix payé 8 860), au village. */
/** Début et fin d'un chantier qui n'est pas encore fini (en 2033). */
const DEBUT_CHANTIER = 2_000_000_000;
const FIN_CHANTIER = DEBUT_CHANTIER + 1_200;

function residenceEnChantier(db: Base) {
  db.exec(`
    INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_started_at, works_ends_at,
      works_cost, invested_cash)
    SELECT t.id, bt.id, 1, 2, ${DEBUT_CHANTIER}, ${FIN_CHANTIER}, 8860, 4430 + 8860
    FROM territories AS t, building_types AS bt
    WHERE t.insee_code = '01001' AND bt.code = 'residence'`);
}

describe('POST /api/v1/territories/:insee/buy', () => {
  it('achète un village libre au prix V0, avec un bouclier de 12 h', async () => {
    const { db, alice, action, cash } = await partie();
    const avant = Math.floor(Date.now() / 1000);

    const reponse = await action('buy', '01001', alice.cookie);

    expect(reponse.statusCode).toBe(200);
    const corps = achatReponseSchema.parse(reponse.json());
    expect(corps.wallet).toEqual({ cash: CAPITAL_DEPART - VILLAGE, gems: 0 });
    expect(corps.territory).toMatchObject({
      state: 'mine',
      owner: { pseudo: 'Alice', isMe: true },
      actions: { canBuy: false, buyReasons: ['TERRITORY_NOT_FREE'], canSell: true, sellPrice: 15_200 },
    });
    expect(corps.territory.shieldUntil).toBeGreaterThanOrEqual(avant + BOUCLIER_ACHAT_S);
    expect(cash(alice.id)).toBe(CAPITAL_DEPART - VILLAGE);
    expect(
      db.prepare("SELECT amount, ref_type FROM wallet_transactions WHERE reason = 'territory_purchase'").all(),
    ).toEqual([{ amount: -VILLAGE, ref_type: 'territory' }]);
    expect(db.prepare('SELECT from_user_id, to_user_id, reason, price FROM territory_ownership_history').all()).toEqual(
      [{ from_user_id: null, to_user_id: alice.id, reason: 'purchase', price: VILLAGE }],
    );
  });

  it('refuse sans rien débiter : non connecté, inconnue, déjà prise, trop chère, limite atteinte', async () => {
    const { alice, bruno, action, cash, donner } = await partie();
    donner('97209', bruno.id);

    const refus = {
      visiteur: await action('buy', '01001'),
      inconnue: await action('buy', '98401', alice.cookie),
      rival: await action('buy', '97209', alice.cookie),
      paris: await action('buy', '75056', alice.cookie),
    };
    donner('01002', alice.id);
    donner('98735', alice.id);
    donner('75056', alice.id);
    const dejaAMoi = await action('buy', '01002', alice.cookie);
    donner('97209', alice.id); // 4 territoires : la limite de départ
    const limite = await action('buy', '01001', alice.cookie);

    expect(refus.visiteur.statusCode).toBe(401);
    expect(refus.inconnue.json().error.code).toBe('TERRITORY_NOT_FOUND');
    expect(refus.rival.json().error).toMatchObject({
      code: 'TERRITORY_NOT_FREE',
      message: expect.stringMatching(/joueur/),
    });
    expect(refus.paris.statusCode).toBe(409);
    expect(refus.paris.json().error).toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
      details: { missing: 34_886_300 - CAPITAL_DEPART },
    });
    expect(dejaAMoi.json().error).toMatchObject({
      code: 'TERRITORY_NOT_FREE',
      message: 'Cette commune est déjà à toi.',
    });
    expect(limite.json().error).toMatchObject({
      code: 'TERRITORY_LIMIT_REACHED',
      message: expect.stringMatching(/4 territoires sur 4/),
    });
    expect(cash(alice.id)).toBe(CAPITAL_DEPART);
  });

  it('une OPA sortante en cours réserve une place', async () => {
    const { db, alice, bruno, action, donner } = await partie();
    for (const insee of ['01002', '75056', '98735']) donner(insee, alice.id);
    donner('97209', bruno.id);
    db.prepare(`
      INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost,
        break_fee, expires_at)
      SELECT id, ?, ?, 1, 1, 1, 0, unixepoch() + 86400 FROM territories WHERE insee_code = '97209'`).run(
      alice.id,
      bruno.id,
    );

    expect((await action('buy', '01001', alice.cookie)).json().error.code).toBe('TERRITORY_LIMIT_REACHED');
  });

  it('rejouer la même clé Idempotency-Key ne paie qu’une fois', async () => {
    const { db, alice, action, cash } = await partie();

    const premier = await action('buy', '01001', alice.cookie, 'achat-0001');
    const rejeu = await action('buy', '01001', alice.cookie, 'achat-0001');
    const autreCommune = await action('buy', '01002', alice.cookie, 'achat-0001');
    const malFormee = await action('buy', '01002', alice.cookie, 'x');

    expect(premier.statusCode).toBe(200);
    expect(rejeu.statusCode).toBe(200);
    expect(rejeu.json()).toEqual(premier.json());
    expect(cash(alice.id)).toBe(CAPITAL_DEPART - VILLAGE);
    expect(
      db.prepare("SELECT count(*) FROM wallet_transactions WHERE reason = 'territory_purchase'").pluck().get(),
    ).toBe(1);
    expect(autreCommune.json().error.code).toBe('VALIDATION_ERROR');
    expect(malFormee.statusCode).toBe(400);
  });
});

describe('POST /api/v1/territories/:insee/sell', () => {
  it('vend à l’État 70 % de V_T : bâtiments détruits, chantier compris, commune libre au prix V0', async () => {
    const { db, alice, bruno, action, cash, proprietaire } = await partie();
    await action('buy', '01001', alice.cookie);
    residenceEnChantier(db);
    db.exec("UPDATE territories SET fortification_value = 1000 WHERE insee_code = '01001'");
    const valeurTotale = VILLAGE + 4_430 + 8_860 + 1_000;

    const reponse = await action('sell', '01001', alice.cookie);

    expect(reponse.statusCode).toBe(200);
    expect(venteReponseSchema.parse(reponse.json())).toEqual({
      insee: '01001',
      saleAmount: prixVenteEtat(valeurTotale),
      wallet: { cash: CAPITAL_DEPART - VILLAGE + 25_200, gems: 0 },
    });
    expect(prixVenteEtat(valeurTotale)).toBe(25_200);
    expect(cash(alice.id)).toBe(CAPITAL_DEPART - VILLAGE + 25_200);
    expect(proprietaire('01001')).toBeNull();
    expect(db.prepare('SELECT count(*) FROM buildings').pluck().get()).toBe(0);
    expect(
      db
        .prepare(
          "SELECT acquired_at, acquired_price, shield_until, fortification_value FROM territories WHERE insee_code = '01001'",
        )
        .get(),
    ).toEqual({ acquired_at: null, acquired_price: null, shield_until: null, fortification_value: 0 });
    expect(
      db.prepare("SELECT from_user_id, to_user_id, price FROM territory_ownership_history WHERE reason = 'sale'").get(),
    ).toEqual({ from_user_id: alice.id, to_user_id: null, price: 25_200 });

    // Revenue libre : un autre joueur la rachète au prix V0.
    const rachat = await action('buy', '01001', bruno.cookie);
    expect(achatReponseSchema.parse(rachat.json()).territory).toMatchObject({ totalValue: VILLAGE, buildings: [] });
  });

  it('refuse : commune d’un autre ou libre, capitale, OPA en cours', async () => {
    const { db, alice, bruno, action, cash, donner } = await partie();
    donner('97209', bruno.id);
    donner('01002', alice.id);
    donner('98735', alice.id);
    db.exec("UPDATE territories SET is_capital = 1 WHERE insee_code = '01002'");
    db.prepare(`
      INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost,
        break_fee, expires_at)
      SELECT id, ?, ?, 1, 1, 1, 0, unixepoch() + 86400 FROM territories WHERE insee_code = '98735'`).run(
      bruno.id,
      alice.id,
    );

    const rival = await action('sell', '97209', alice.cookie);
    const libre = await action('sell', '01001', alice.cookie);
    const capitale = await action('sell', '01002', alice.cookie);
    const opa = await action('sell', '98735', alice.cookie);
    const visiteur = await action('sell', '01002');

    expect(rival.statusCode).toBe(403);
    expect(rival.json().error.code).toBe('FORBIDDEN');
    expect(libre.json().error.code).toBe('FORBIDDEN');
    expect(capitale.statusCode).toBe(409);
    expect(capitale.json().error.code).toBe('CAPITAL_IMMUNE');
    expect(opa.json().error.code).toBe('TAKEOVER_ALREADY_PENDING');
    expect(visiteur.statusCode).toBe(401);
    expect(cash(alice.id)).toBe(CAPITAL_DEPART);
  });

  it('prix réglé à 25 % : acheter puis revendre à l’État ne rapporte rien (fiche et vente d’accord)', async () => {
    const { db, app, alice, action, cash } = await partie();
    db.prepare(
      "INSERT INTO live_config (price_pct, income_pct, building_pct, reason, created_by, starts_at) VALUES (25, 100, 100, 'Soldes', ?, unixepoch() - 10)",
    ).run(alice.id);
    await action('buy', '01001', alice.cookie);
    expect(cash(alice.id)).toBe(CAPITAL_DEPART - 5_500);

    const fiche = ficheCommuneSchema.parse(
      (await app.inject({ url: '/api/v1/territories/01001', headers: { cookie: alice.cookie } })).json(),
    );
    const vente = venteReponseSchema.parse((await action('sell', '01001', alice.cookie)).json());

    expect(vente.saleAmount).toBe(3_800); // 70 % du prix payé, pas de V0 (15 200)
    expect(fiche.actions.sellPrice).toBe(vente.saleAmount);
    expect(cash(alice.id)).toBeLessThan(CAPITAL_DEPART);
  });

  it('rejouer la même clé ne crédite qu’une fois', async () => {
    const { db, alice, action, cash } = await partie();
    await action('buy', '01001', alice.cookie);

    const premier = await action('sell', '01001', alice.cookie, 'vente-0001');
    const rejeu = await action('sell', '01001', alice.cookie, 'vente-0001');

    expect(rejeu.statusCode).toBe(200);
    expect(rejeu.json()).toEqual(premier.json());
    expect(cash(alice.id)).toBe(CAPITAL_DEPART - VILLAGE + 15_200);
    expect(db.prepare("SELECT count(*) FROM wallet_transactions WHERE reason = 'territory_sale'").pluck().get()).toBe(
      1,
    );
  });
});

describe('actions de vente sur la fiche', () => {
  it('prix de vente sur ma commune ; raisons ailleurs', async () => {
    const { db, app, alice, bruno, action, donner } = await partie();
    await action('buy', '01001', alice.cookie);
    donner('01002', alice.id);
    db.exec("UPDATE territories SET is_capital = 1 WHERE insee_code = '01002'");
    const fiche = async (insee: string, cookie?: string) =>
      ficheCommuneSchema.parse(
        (
          await app.inject({ method: 'GET', url: `/api/v1/territories/${insee}`, headers: cookie ? { cookie } : {} })
        ).json(),
      ).actions;

    expect(await fiche('01001', alice.cookie)).toMatchObject({ canSell: true, sellPrice: 15_200, sellReasons: [] });
    expect(await fiche('01002', alice.cookie)).toMatchObject({ canSell: false, sellReasons: ['CAPITAL_IMMUNE'] });
    expect(await fiche('01001', bruno.cookie)).toMatchObject({
      canSell: false,
      sellPrice: null,
      sellReasons: ['FORBIDDEN'],
    });
    expect(await fiche('01001')).toMatchObject({ canSell: false, sellPrice: null, sellReasons: ['UNAUTHENTICATED'] });
  });
});

describe('GET /api/v1/me/territories', () => {
  it('capitale d’abord, valeur totale, emplacements et chantiers ; 4 territoires au départ', async () => {
    const { db, app, alice, action } = await partie();
    const lire = async (cookie?: string) =>
      app.inject({ method: 'GET', url: '/api/v1/me/territories', headers: cookie ? { cookie } : {} });
    expect(mesTerritoiresSchema.parse((await lire(alice.cookie)).json())).toEqual({ territories: [], max: 4 });

    await action('buy', '01001', alice.cookie);
    db.prepare("UPDATE territories SET owner_id = ?, acquired_at = 1, is_capital = 1 WHERE insee_code = '01002'").run(
      alice.id,
    );
    residenceEnChantier(db);

    const corps = mesTerritoiresSchema.parse((await lire(alice.cookie)).json());

    expect(corps.max).toBe(4);
    expect(corps.territories.map((t) => t.insee)).toEqual(['01002', '01001']);
    expect(corps.territories[0]).toMatchObject({ isCapital: true, shieldUntil: null, works: [] });
    expect(corps.territories[1]).toMatchObject({
      name: 'L’Abergement-Clémenciat',
      zone: 'MET',
      baseValue: VILLAGE,
      totalValue: VILLAGE + 4_430 + 8_860,
      isCapital: false,
      buildingSlots: { total: 3, used: 1 },
      works: [
        {
          territoryInsee: '01001',
          territoryName: 'L’Abergement-Clémenciat',
          typeCode: 'residence',
          name: 'Résidence',
          targetLevel: 2,
          startedAt: DEBUT_CHANTIER,
          endsAt: FIN_CHANTIER,
          cost: 8_860,
        },
      ],
    });
    expect(corps.territories[1]?.shieldUntil).toBeGreaterThan(Date.now() / 1000);
    expect((await lire()).statusCode).toBe(401);
  });
});
