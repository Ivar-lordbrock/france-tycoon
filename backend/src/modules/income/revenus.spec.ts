import {
  chantierFiniNonLuSchema,
  encaissementReponseSchema,
  lireNotificationsReponseSchema,
  moiReponseSchema,
  PLAFOND_HORS_LIGNE_S,
} from '@france-tycoon/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Base } from '../../db/connexion.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { creerEncaisseur } from './revenus.ts';

// Revenus passifs en temps simulé (docs/05-equilibrage.md, 5.3).
// Village 01001 : V0 = 21 800 → sol 218 ₮/h ; Résidence niveau 1 : 295 ₮/h, niveau 2 : 502 ₮/h.

const h = 3_600;
const T0 = 1_800_000_000;
const SOL = 218;
const RESIDENCE_1 = 295;
const RESIDENCE_2 = 502;

function baseAvecJoueur(): { db: Base; id: number } {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 5_000 },
  ]);
  const id = db
    .prepare(`
      INSERT INTO users (google_id, email, pseudo, cash, income_collected_at)
      VALUES ('g1', 'a@test.fr', 'Alice', 1000, ${T0}) RETURNING id`)
    .pluck()
    .get() as number;
  return { db, id };
}

function posseder(db: Base, id: number, insee: string) {
  db.prepare('UPDATE territories SET owner_id = ?, acquired_at = ? WHERE insee_code = ?').run(id, T0, insee);
}

/** Une Résidence au village, en chantier vers `cible`, finie à `fin`. */
function residence(db: Base, niveau: number, cible: number | null, fin: number | null): number {
  return db
    .prepare(`
      INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_started_at, works_ends_at,
        works_cost, invested_cash)
      SELECT t.id, bt.id, ?, ?, ?, ?, ?, 4430 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01001' AND bt.code = 'residence'
      RETURNING id`)
    .pluck()
    .get(niveau, cible, cible === null ? null : T0, fin, cible === null ? null : 4430) as number;
}

function encaisser(db: Base, id: number, maintenant: number) {
  const encaisseur = creerEncaisseur(db);
  return db.transaction(() => encaisseur(id, maintenant)).immediate();
}

const joueur = (db: Base, id: number) =>
  db
    .prepare('SELECT cash, income_collected_at AS depuis, income_remainder AS reste FROM users WHERE id = ?')
    .get(id) as { cash: number; depuis: number; reste: number };

describe('encaisser (moteur des revenus)', () => {
  it('on achète un village, on construit, on revient 2 h plus tard : le revenu encaissé est exact', () => {
    const { db, id } = baseAvecJoueur();
    posseder(db, id, '01001');
    const bat = residence(db, 0, 1, T0 + 600); // Résidence : 10 min de chantier

    const resultat = encaisser(db, id, T0 + 2 * h);

    // 10 min au sol seul, puis 1 h 50 avec la Résidence : (218 × 600 + 513 × 6 600) / 3 600 = 976,8
    expect(resultat.collected).toBe(976);
    expect(resultat.incomePerHour).toBe(SOL + RESIDENCE_1);
    expect(joueur(db, id)).toEqual({ cash: 1_976, depuis: T0 + 2 * h, reste: 3_000 });
    expect(resultat.finished).toEqual([
      {
        buildingId: bat,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        typeCode: 'residence',
        name: 'Résidence',
        level: 1,
        finishedAt: T0 + 600,
      },
    ]);
    expect(
      db
        .prepare(
          'SELECT level, target_level AS cible, works_ends_at AS fin, works_cost AS cout FROM buildings WHERE id = ?',
        )
        .get(bat),
    ).toEqual({ level: 1, cible: null, fin: null, cout: null });
    expect(
      db.prepare("SELECT amount, reason, metadata FROM wallet_transactions WHERE reason = 'income_collect'").get(),
    ).toEqual({ amount: 976, reason: 'income_collect', metadata: JSON.stringify({ since: T0, until: T0 + 2 * h }) });
    const note = db.prepare('SELECT kind, payload, created_at AS creee FROM notifications').get() as {
      kind: string;
      payload: string;
      creee: number;
    };
    expect(note.kind).toBe('building_done');
    expect(note.creee).toBe(T0 + 600);
    expect(JSON.parse(note.payload)).toEqual(resultat.finished[0]);
  });

  it('plusieurs chantiers finis pendant l’absence : le revenu change à chaque date de fin', () => {
    const { db, id } = baseAvecJoueur();
    posseder(db, id, '01001');
    residence(db, 1, 2, T0 + h); // 1 → 2 au bout d'une heure
    residence(db, 0, 1, T0 + 2 * h); // nouvelle Résidence au bout de deux heures

    const resultat = encaisser(db, id, T0 + 3 * h);

    const attendu = SOL + RESIDENCE_1 + (SOL + RESIDENCE_2) + (SOL + RESIDENCE_2 + RESIDENCE_1);
    expect(resultat.collected).toBe(attendu);
    expect(resultat.finished.map((f) => f.finishedAt)).toEqual([T0 + h, T0 + 2 * h]);
    expect(resultat.incomePerHour).toBe(SOL + RESIDENCE_2 + RESIDENCE_1);
  });

  it('48 h comptées au plus ; un chantier fini plus tard est quand même terminé', () => {
    const { db, id } = baseAvecJoueur();
    posseder(db, id, '01001');
    residence(db, 0, 1, T0 + 60 * h);

    const resultat = encaisser(db, id, T0 + 72 * h);

    expect(PLAFOND_HORS_LIGNE_S).toBe(48 * h);
    expect(resultat.collected).toBe(SOL * 48);
    expect(resultat.finished).toHaveLength(1);
    expect(joueur(db, id).depuis).toBe(T0 + 72 * h);
  });

  it('les fractions de ₮ ne se perdent pas, même en encaissant toutes les 30 s', () => {
    const { db, id } = baseAvecJoueur();
    posseder(db, id, '01002'); // V0 = 5 000 → 50 ₮/h : 0,4 ₮ toutes les 30 s

    let total = 0;
    for (let i = 1; i <= 120; i++) total += encaisser(db, id, T0 + 30 * i).collected;

    expect(total).toBe(50);
    expect(joueur(db, id)).toEqual({ cash: 1_050, depuis: T0 + h, reste: 0 });
    // Un mouvement par ₮ gagné, pas un par appel : rien n'est écrit quand le gain est nul.
    expect(db.prepare("SELECT count(*) FROM wallet_transactions WHERE reason = 'income_collect'").pluck().get()).toBe(
      50,
    );
  });

  it('rien à faire si aucun temps n’est passé', () => {
    const { db, id } = baseAvecJoueur();
    posseder(db, id, '01001');

    expect(encaisser(db, id, T0)).toEqual({ collected: 0, cash: 1_000, incomePerHour: SOL, finished: [] });
    expect(encaisser(db, id, T0 - 10).collected).toBe(0);
    expect(joueur(db, id).depuis).toBe(T0);
  });

  it('refuse de tourner hors d’une transaction', () => {
    const { db, id } = baseAvecJoueur();
    expect(() => creerEncaisseur(db)(id, T0)).toThrow(/transaction/);
  });
});

describe('routes : encaisser d’abord', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Partie dont l'horloge est figée ; `avancer` la fait avancer de quelques secondes. */
  async function partie() {
    vi.useFakeTimers({ toFake: ['Date'] });
    const debut = Math.floor(Date.now() / 1000);
    vi.setSystemTime(debut * 1000);
    const db = baseDeTest();
    insererCommunes(db, [
      { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
      { insee: '01002', nom: 'L’Abergement-de-Varey', departement: '01', population: 260, valeur: 12_000 },
    ]);
    const app = appDeTest(db);
    const alice = await connecter(app, 'Alice');
    const avancer = (secondes: number) => vi.setSystemTime(Date.now() + secondes * 1000);
    const requete = (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({ method, url: `/api/v1${url}`, headers: { cookie: alice.cookie }, ...(payload ? { payload } : {}) });
    return { db, app, alice, debut, avancer, requete };
  }

  it('GET /me : revenu des bâtiments compris, chantiers finis dans le résumé, puis marqués lus', async () => {
    const { db, alice, debut, avancer, requete } = await partie();
    db.prepare("UPDATE territories SET owner_id = ?, acquired_at = ? WHERE insee_code = '01001'").run(alice.id, debut);
    db.prepare(`
      INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_started_at, works_ends_at,
        works_cost, invested_cash)
      SELECT t.id, bt.id, 0, 1, ?, ?, 4430, 4430 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01001' AND bt.code = 'residence'`).run(debut, debut + 600);
    avancer(2 * h);

    const moi = moiReponseSchema.parse((await requete('GET', '/me')).json());

    expect(moi.wallet.cash).toBe(50_000 + 976);
    expect(moi.incomePerHour).toBe(SOL + RESIDENCE_1);
    expect(moi.unreadNotifications).toBe(1);
    expect(moi.finishedWorks).toEqual([
      chantierFiniNonLuSchema.parse({
        buildingId: 1,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        typeCode: 'residence',
        name: 'Résidence',
        level: 1,
        finishedAt: debut + 600,
        notificationId: 1,
      }),
    ]);

    // Le résumé reste tant qu'il n'est pas lu ; l'encaissement suivant ne rajoute rien.
    expect(moiReponseSchema.parse((await requete('GET', '/me')).json()).finishedWorks).toHaveLength(1);
    const lu = await requete('POST', '/me/notifications/read', { ids: [moi.finishedWorks[0]?.notificationId] });
    expect(lireNotificationsReponseSchema.parse(lu.json())).toEqual({ unreadNotifications: 0 });
    expect(moiReponseSchema.parse((await requete('GET', '/me')).json())).toMatchObject({
      unreadNotifications: 0,
      finishedWorks: [],
    });
  });

  it('POST /me/collect : encaissement explicite', async () => {
    const { db, alice, debut, avancer, requete } = await partie();
    db.prepare("UPDATE territories SET owner_id = ?, acquired_at = ? WHERE insee_code = '01001'").run(alice.id, debut);
    avancer(h);

    const premier = encaissementReponseSchema.parse((await requete('POST', '/me/collect')).json());
    const second = encaissementReponseSchema.parse((await requete('POST', '/me/collect')).json());

    expect(premier).toEqual({ collected: SOL, cash: 50_000 + SOL, incomePerHour: SOL });
    expect(second).toEqual({ collected: 0, cash: 50_000 + SOL, incomePerHour: SOL });
  });

  it('acheter : les revenus en attente comptent pour payer', async () => {
    const { db, alice, debut, avancer, requete } = await partie();
    db.prepare("UPDATE territories SET owner_id = ?, acquired_at = ? WHERE insee_code = '01002'").run(alice.id, debut);
    db.prepare('UPDATE users SET cash = 21700 WHERE id = ?').run(alice.id); // 100 ₮ de moins que le village
    avancer(h); // 01002 : 120 ₮/h

    const achat = await requete('POST', '/territories/01001/buy');

    expect(achat.statusCode).toBe(200);
    expect(achat.json().wallet.cash).toBe(21_700 + 120 - 21_800);
  });

  it('vendre : la commune vendue paie d’abord ce qu’elle a rapporté', async () => {
    const { db, alice, debut, avancer, requete } = await partie();
    db.prepare("UPDATE territories SET owner_id = ?, acquired_at = ? WHERE insee_code = '01001'").run(alice.id, debut);
    avancer(2 * h);

    const vente = await requete('POST', '/territories/01001/sell');

    expect(vente.statusCode).toBe(200);
    expect(vente.json().wallet.cash).toBe(50_000 + 2 * SOL + 15_200);
  });

  it('marquer tous les messages lus d’un coup ; corps vide refusé', async () => {
    const { db, alice, requete } = await partie();
    db.prepare("INSERT INTO notifications (user_id, kind) VALUES (?, 'x'), (?, 'y')").run(alice.id, alice.id);

    expect((await requete('POST', '/me/notifications/read', {})).statusCode).toBe(400);
    expect((await requete('POST', '/me/notifications/read', { all: true })).json()).toEqual({
      unreadNotifications: 0,
    });
  });
});
