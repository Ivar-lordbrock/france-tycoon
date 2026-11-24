import {
  contenuOpaRecueSchema,
  DELAI_REPONSE_OPA_S,
  devisOpaSchema,
  ficheCommuneSchema,
  opaReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

const jour = 86_400;

/**
 * Alice (100 000 ₮) vise le village de Bruno (V_T 21 800 ₮). Les deux comptes ont plus de 7 jours
 * et plus de protection débutant : l'OPA est possible, chaque test retire une condition.
 */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 12_000 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 90_000 },
    { insee: '97209', nom: 'Fort-de-France', departement: '972', zone: 'MQ', population: 76_000, valeur: 280_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const sql = (requete: string, ...valeurs: unknown[]) => db.prepare(requete).run(...valeurs);
  sql(`UPDATE users SET created_at = unixepoch() - ${8 * jour}, newbie_shield_until = unixepoch() - 1`);
  sql('UPDATE users SET cash = 100000 WHERE id = ?', alice.id);
  sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01001'", bruno.id);

  const devis = (insee: string, cookie?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/territories/${insee}/takeover-quote`,
      headers: cookie ? { cookie } : {},
    });
  const lancer = (insee: string, cookie?: string, cle?: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/territories/${insee}/takeovers`,
      headers: { ...(cookie ? { cookie } : {}), ...(cle ? { 'idempotency-key': cle } : {}) },
    });
  const cash = (id: number) => db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(id) as number;
  /** Une OPA écrite directement en base (pour préparer une situation) ; en cours, elle finit dans 1 h. */
  const opaEnBase = (attaquant: number, defenseur: number, insee: string, status = 'pending', resoluLe?: number) =>
    sql(
      `INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost,
        break_fee, status, created_at, expires_at, resolved_at)
      SELECT id, ?, ?, 10000, 15000, 3500, 800, ?, unixepoch() - ${10 * jour},
        CASE ? WHEN 'pending' THEN unixepoch() + 3600 ELSE unixepoch() - ${9 * jour} END, ?
      FROM territories WHERE insee_code = ?`,
      attaquant,
      defenseur,
      status,
      status,
      status === 'pending' ? null : (resoluLe ?? null),
      insee,
    );
  return { db, app, alice, bruno, sql, devis, lancer, cash, opaEnBase };
}

describe('GET /territories/:insee/takeover-quote', () => {
  it('donne les montants qui seraient figés maintenant', async () => {
    const { alice, devis } = await partie();

    const reponse = await devis('01001', alice.cookie);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['cache-control']).toBe('private, no-store');
    expect(devisOpaSchema.parse(reponse.json())).toEqual({
      territoryValue: 21_800,
      offerAmount: 32_700,
      defenseCost: 7_700,
      breakFee: 1_700,
      eligible: true,
      reasons: [],
    });
  });

  it('compte les bâtiments et les fortifications dans la valeur', async () => {
    const { db, alice, sql, devis } = await partie();
    sql("UPDATE territories SET fortification_value = 1000 WHERE insee_code = '01001'");
    db.exec(`
      INSERT INTO buildings (territory_id, building_type_id, level, invested_cash)
      SELECT t.id, bt.id, 1, 4430 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01001' AND bt.code = 'residence'`);

    const corps = devisOpaSchema.parse((await devis('01001', alice.cookie)).json());

    // V_T = 21 800 + 4 430 + 1 000 = 27 230.
    expect(corps).toMatchObject({ territoryValue: 27_230, offerAmount: 40_900, defenseCost: 9_600, breakFee: 2_100 });
  });

  it('liste tout ce qui bloque, sans doublon', async () => {
    const { alice, bruno, sql, devis } = await partie();
    sql('UPDATE users SET cash = 1000, created_at = unixepoch() WHERE id = ?', alice.id);
    sql('UPDATE users SET newbie_shield_until = unixepoch() + 3600 WHERE id = ?', bruno.id);
    sql("UPDATE territories SET shield_until = unixepoch() + 3600 WHERE insee_code = '01001'");

    const corps = devisOpaSchema.parse((await devis('01001', alice.cookie)).json());

    expect(corps.eligible).toBe(false);
    expect(corps.reasons).toEqual(['SHIELD_ACTIVE', 'NEWBIE_PROTECTION', 'INSUFFICIENT_FUNDS']);
  });

  it('commune libre ou déjà à moi : FORBIDDEN ; code inconnu : 404 ; visiteur : 401', async () => {
    const { alice, bruno, devis } = await partie();

    const libre = devisOpaSchema.parse((await devis('01002', alice.cookie)).json());
    const aMoi = devisOpaSchema.parse((await devis('01001', bruno.cookie)).json());
    const inconnue = await devis('99999', alice.cookie);
    const visiteur = await devis('01001');

    expect(libre.reasons).toEqual(['FORBIDDEN']);
    expect(aMoi.reasons).toEqual(['FORBIDDEN']);
    expect(inconnue.statusCode).toBe(404);
    expect(inconnue.json().error.code).toBe('TERRITORY_NOT_FOUND');
    expect(visiteur.statusCode).toBe(401);
  });
});

describe('POST /territories/:insee/takeovers', () => {
  it('bloque l’offre en séquestre, prévient le défenseur, ouvre 24 h de réponse', async () => {
    const { db, app, alice, bruno, lancer, cash } = await partie();

    const reponse = await lancer('01001', alice.cookie);

    expect(reponse.statusCode).toBe(200);
    const { takeover, wallet } = opaReponseSchema.parse(reponse.json());
    expect(takeover).toMatchObject({
      territory: { insee: '01001', name: 'L’Abergement-Clémenciat', zone: 'MET' },
      attacker: { pseudo: 'Alice' },
      defender: { pseudo: 'Bruno' },
      role: 'attacker',
      territoryValue: 21_800,
      offerAmount: 32_700,
      defenseCost: 7_700,
      breakFee: 1_700,
      status: 'pending',
      resolvedAt: null,
    });
    expect(takeover.expiresAt - takeover.createdAt).toBe(DELAI_REPONSE_OPA_S);
    expect(wallet.cash).toBe(67_300);
    expect(cash(alice.id)).toBe(67_300);
    expect(cash(bruno.id)).toBe(50_000); // rien ne bouge chez le défenseur avant sa réponse

    const journal = db
      .prepare(
        "SELECT amount, ref_type AS refType, ref_id AS refId FROM wallet_transactions WHERE reason = 'takeover_escrow'",
      )
      .all();
    expect(journal).toEqual([{ amount: -32_700, refType: 'takeover', refId: takeover.id }]);

    const notif = db.prepare('SELECT user_id AS userId, kind, payload, read_at AS readAt FROM notifications').get() as {
      userId: number;
      kind: string;
      payload: string;
      readAt: number | null;
    };
    expect(notif).toMatchObject({ userId: bruno.id, kind: 'takeover_received', readAt: null });
    expect(contenuOpaRecueSchema.parse(JSON.parse(notif.payload))).toEqual({
      takeoverId: takeover.id,
      territoryInsee: '01001',
      territoryName: 'L’Abergement-Clémenciat',
      attackerPseudo: 'Alice',
      offerAmount: 32_700,
      defenseCost: 7_700,
      expiresAt: takeover.expiresAt,
    });

    // La fiche montre l'OPA en cours à tout le monde.
    const fiche = await app.inject({
      method: 'GET',
      url: '/api/v1/territories/01001',
      headers: { cookie: bruno.cookie },
    });
    expect(ficheCommuneSchema.parse(fiche.json())).toMatchObject({
      state: 'takeover',
      takeover: { id: takeover.id, endsAt: takeover.expiresAt },
      actions: { canSell: false, sellReasons: ['TAKEOVER_ALREADY_PENDING'] },
    });
  });

  it('même clé Idempotency-Key : même OPA, payée une seule fois', async () => {
    const { db, alice, sql, lancer, cash } = await partie();
    sql("UPDATE territories SET owner_id = (SELECT id FROM users WHERE pseudo = 'Bruno') WHERE insee_code = '01004'");

    const premiere = await lancer('01001', alice.cookie, 'opa-village-1');
    const rejouee = await lancer('01001', alice.cookie, 'opa-village-1');
    const autreCommune = await lancer('01004', alice.cookie, 'opa-village-1');

    expect(rejouee.statusCode).toBe(200);
    expect(rejouee.json().takeover.id).toBe(premiere.json().takeover.id);
    expect(cash(alice.id)).toBe(67_300);
    expect(db.prepare('SELECT count(*) FROM takeovers').pluck().get()).toBe(1);
    expect(autreCommune.statusCode).toBe(400);
    expect(autreCommune.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('attaquer met fin à sa propre protection débutant', async () => {
    const { db, alice, sql, lancer } = await partie();
    sql('UPDATE users SET newbie_shield_until = unixepoch() + 3600 WHERE id = ?', alice.id);

    const reponse = await lancer('01001', alice.cookie);

    const protection = db.prepare('SELECT newbie_shield_until FROM users WHERE id = ?').pluck().get(alice.id) as number;
    expect(protection).toBe(reponse.json().takeover.createdAt);
  });

  it('une seule OPA sortante, deux à partir du rang Magnat', async () => {
    const { alice, bruno, sql, lancer } = await partie();
    sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01004'", bruno.id);
    sql('UPDATE users SET cash = 1000000 WHERE id = ?', bruno.id); // Bruno reste assez gros pour Alice

    expect((await lancer('01001', alice.cookie)).statusCode).toBe(200);
    const deuxieme = await lancer('01004', alice.cookie);
    expect(deuxieme.statusCode).toBe(409);
    expect(deuxieme.json().error).toMatchObject({
      code: 'TAKEOVER_LIMIT',
      message: 'Tu mènes déjà une OPA : attends qu’elle se termine.',
    });

    sql('UPDATE users SET rank_level = 3, cash = 300000 WHERE id = ?', alice.id);
    expect((await lancer('01004', alice.cookie)).statusCode).toBe(200);
  });

  it('une OPA à la fois par commune', async () => {
    const { app, alice, sql, lancer } = await partie();
    const carla = await connecter(app, 'Carla');
    sql(
      `UPDATE users SET created_at = unixepoch() - ${8 * jour}, newbie_shield_until = 0, cash = 100000 WHERE id = ?`,
      carla.id,
    );

    expect((await lancer('01001', alice.cookie)).statusCode).toBe(200);
    const reponse = await lancer('01001', carla.cookie);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error.code).toBe('TAKEOVER_ALREADY_PENDING');
  });

  it('pas plus de deux OPA reçues par un même joueur', async () => {
    const { app, alice, bruno, sql, lancer, opaEnBase } = await partie();
    const carla = await connecter(app, 'Carla');
    const david = await connecter(app, 'David');
    sql("UPDATE territories SET owner_id = ? WHERE insee_code IN ('01002', '01004')", bruno.id);
    opaEnBase(carla.id, bruno.id, '01002');
    opaEnBase(david.id, bruno.id, '01004');

    const reponse = await lancer('01001', alice.cookie);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error).toMatchObject({ code: 'TAKEOVER_LIMIT', message: 'Ce joueur subit déjà 2 OPA.' });
  });

  it('7 jours d’attente après une OPA ratée contre le même joueur', async () => {
    const { alice, bruno, sql, devis, lancer, opaEnBase } = await partie();
    sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01002'", bruno.id);
    const ilYaUnJour = Math.floor(Date.now() / 1000) - jour;
    opaEnBase(alice.id, bruno.id, '01002', 'defended', ilYaUnJour);

    const refus = await lancer('01001', alice.cookie);
    expect(refus.statusCode).toBe(409);
    expect(refus.json().error).toMatchObject({
      code: 'TAKEOVER_COOLDOWN',
      details: { nextAt: ilYaUnJour + 7 * jour },
    });

    // Une OPA réussie (ou ratée il y a plus de 7 jours) ne bloque pas.
    sql("UPDATE takeovers SET status = 'succeeded'");
    expect(devisOpaSchema.parse((await devis('01001', alice.cookie)).json()).reasons).toEqual([]);
  });

  it.each([
    {
      cas: 'capitale',
      preparer: "UPDATE territories SET is_capital = 1 WHERE insee_code = '01001'",
      code: 'CAPITAL_IMMUNE',
    },
    {
      cas: 'bouclier',
      preparer: "UPDATE territories SET shield_until = unixepoch() + 3600 WHERE insee_code = '01001'",
      code: 'SHIELD_ACTIVE',
    },
    {
      cas: 'défenseur débutant',
      preparer: "UPDATE users SET newbie_shield_until = unixepoch() + 3600 WHERE pseudo = 'Bruno'",
      code: 'NEWBIE_PROTECTION',
    },
    {
      cas: 'compte de moins de 7 jours',
      preparer: "UPDATE users SET created_at = unixepoch() - 3600 WHERE pseudo = 'Alice'",
      code: 'NEWBIE_PROTECTION',
    },
    {
      cas: 'cible trop petite',
      preparer: "UPDATE users SET cash = 1000000 WHERE pseudo = 'Alice'",
      code: 'TARGET_TOO_SMALL',
    },
    {
      cas: 'plus de place',
      preparer: `UPDATE users SET max_territories = 1 WHERE pseudo = 'Alice';
        UPDATE territories SET owner_id = (SELECT id FROM users WHERE pseudo = 'Alice') WHERE insee_code = '01002'`,
      code: 'TERRITORY_LIMIT_REACHED',
    },
  ])('refusée : $cas → $code (409), rien n’est payé', async ({ preparer, code }) => {
    const { db, alice, lancer, cash } = await partie();
    db.exec(preparer);
    const avant = cash(alice.id);

    const reponse = await lancer('01001', alice.cookie);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error.code).toBe(code);
    expect(cash(alice.id)).toBe(avant);
    expect(db.prepare('SELECT count(*) FROM takeovers').pluck().get()).toBe(0);
  });

  it('pas assez de cash : dit combien il manque', async () => {
    const { alice, sql, lancer } = await partie();
    sql('UPDATE users SET cash = 30000 WHERE id = ?', alice.id);

    const reponse = await lancer('01001', alice.cookie);

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error).toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
      details: { missing: 2_700, currency: 'cash' },
    });
  });

  it('commune libre ou à moi : 403 ; visiteur : 401', async () => {
    const { alice, bruno, lancer } = await partie();

    expect((await lancer('01002', alice.cookie)).statusCode).toBe(403);
    expect((await lancer('01001', bruno.cookie)).statusCode).toBe(403);
    expect((await lancer('01001')).statusCode).toBe(401);
  });
});

describe('fiche de la commune : OPA possible', () => {
  it('canTakeover vrai quand le devis ne bloque pas', async () => {
    const { app, alice } = await partie();

    const reponse = await app.inject({
      method: 'GET',
      url: '/api/v1/territories/01001',
      headers: { cookie: alice.cookie },
    });

    expect(ficheCommuneSchema.parse(reponse.json()).actions).toMatchObject({ canTakeover: true, takeoverReasons: [] });
  });
});
