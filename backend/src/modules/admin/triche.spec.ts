import {
  alertesReponseSchema,
  journalActiviteReponseSchema,
  journalAuditReponseSchema,
  journalErreursReponseSchema,
  vueEnsembleReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type App, construireApp } from '../../app.ts';
import { ouvrirBase } from '../../db/connexion.ts';
import { baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { versCsv } from './triche.ts';

/** « Chef » admin d'office, « Modo » modérateur, Alice joueuse : tous depuis la même adresse (inject). */
async function partie(avant: (app: App) => void = () => {}) {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const app = construireApp({
    db,
    auth: { devLogin: true, ipSalt: 'sel-de-test' },
    adminEmails: ['chef@dev.invalid'],
  });
  avant(app); // routes ajoutées avant la première requête
  const chef = await connecter(app, 'Chef');
  const modo = await connecter(app, 'Modo');
  const alice = await connecter(app, 'Alice');
  db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);
  return { app, db, chef, modo, alice };
}

const appel = (app: App, cookie: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1/admin/${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
const alertes = async (app: App, cookie: string) =>
  alertesReponseSchema.parse((await appel(app, cookie, 'GET', 'cheat-alerts')).json()).alerts;

describe('dashboard /admin : anti-triche, journaux et export', () => {
  it('droits : le joueur ne voit rien, le modérateur lit et classe, seul l’admin exporte', async () => {
    const { app, chef, modo, alice } = await partie();
    const lectures = ['cheat-alerts', 'logs/activity', 'logs/audit', 'logs/errors'];
    for (const url of lectures) {
      expect((await appel(app, alice.cookie, 'GET', url)).statusCode).toBe(403);
      expect((await appel(app, modo.cookie, 'GET', url)).statusCode).toBe(200);
    }
    const ip = (await alertes(app, modo.cookie)).find((a) => a.rule === 'shared_ip');
    const revue = { key: ip?.key, note: 'Même famille, vu en message' };
    expect((await appel(app, alice.cookie, 'POST', 'cheat-alerts/review', revue)).statusCode).toBe(403);
    expect((await appel(app, modo.cookie, 'POST', 'cheat-alerts/review', revue)).statusCode).toBe(204);

    for (const quoi of ['players', 'audit', 'activity']) {
      expect((await appel(app, alice.cookie, 'GET', `export/${quoi}`)).statusCode).toBe(403);
      expect((await appel(app, modo.cookie, 'GET', `export/${quoi}`)).statusCode).toBe(403);
      expect((await appel(app, chef.cookie, 'GET', `export/${quoi}`)).statusCode).toBe(200);
    }
    expect((await appel(app, chef.cookie, 'GET', 'export/emails')).statusCode).toBe(400);
  });

  it('les 3 règles, le classement, et une alerte classée qui revient quand un fait change', async () => {
    const { app, db, chef, modo, alice } = await partie();

    // 1. Même IP hachée : les 3 comptes.
    let liste = await alertes(app, modo.cookie);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ rule: 'shared_ip', count: 3, review: null });
    expect(liste[0]?.players.map((p) => p.pseudo)).toEqual(['Chef', 'Modo', 'Alice']);
    const cleIp = liste[0]?.key ?? '';

    const revue = { key: cleIp, note: 'Comptes de l’équipe' };
    expect((await appel(app, modo.cookie, 'POST', 'cheat-alerts/review', revue)).statusCode).toBe(204);
    expect((await appel(app, modo.cookie, 'POST', 'cheat-alerts/review', revue)).statusCode).toBe(409);
    const inconnue = { key: 'ip:abc:2:9', note: 'Rien' };
    expect((await appel(app, modo.cookie, 'POST', 'cheat-alerts/review', inconnue)).statusCode).toBe(404);
    liste = await alertes(app, modo.cookie);
    expect(liste[0]?.review).toMatchObject({ by: 'Modo', note: 'Comptes de l’équipe' });
    const audit = db.prepare("SELECT target_id, reason FROM admin_audit WHERE action = 'alert.review'").all();
    expect(audit).toEqual([{ target_id: cleIp, reason: 'Comptes de l’équipe' }]);

    // Un 4e compte sur la même adresse : faits nouveaux, l'alerte revient.
    await connecter(app, 'Bob');
    liste = await alertes(app, modo.cookie);
    expect(liste[0]).toMatchObject({ rule: 'shared_ip', count: 4, review: null });

    // 2. Argent apparu hors du registre : vu tout de suite sur le compte, puis gardé dans l'historique.
    db.prepare('UPDATE users SET cash = cash + 5000 WHERE id = ?').run(alice.id);
    let sauts = (await alertes(app, modo.cookie)).filter((a) => a.rule === 'balance_jump');
    expect(sauts).toMatchObject([{ count: 5_000, currency: 'cash', players: [{ pseudo: 'Alice' }] }]);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/territories/01004/buy', headers: { cookie: alice.cookie } }))
        .statusCode,
    ).toBe(200);
    sauts = (await alertes(app, modo.cookie)).filter((a) => a.rule === 'balance_jump');
    expect(sauts).toHaveLength(1);
    expect(sauts[0]?.key).toMatch(/^solde:\d+$/);
    expect(sauts[0]?.count).toBe(5_000);

    // 3. Trois OPA entre Alice et Bob (dans les deux sens) en 7 jours ; deux entre Alice et Chef ne comptent pas.
    const bob = db.prepare("SELECT id FROM users WHERE pseudo = 'Bob'").pluck().get() as number;
    const commune = db.prepare("SELECT id FROM territories WHERE insee_code = '01004'").pluck().get();
    const opa = db.prepare(`
      INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost,
        break_fee, status, expires_at, resolved_at)
      VALUES (?, ?, ?, 30000, 36000, 40000, 1000, 'cancelled', unixepoch() + 86400, unixepoch())`);
    for (const [a, d] of [
      [alice.id, bob],
      [bob, alice.id],
      [alice.id, bob],
      [alice.id, chef.id],
      [chef.id, alice.id],
    ]) {
      opa.run(commune, a, d);
    }
    const repetees = (await alertes(app, modo.cookie)).filter((a) => a.rule === 'repeat_takeovers');
    expect(repetees).toMatchObject([{ count: 3, players: [{ pseudo: 'Alice' }, { pseudo: 'Bob' }] }]);

    const vue = vueEnsembleReponseSchema.parse((await appel(app, modo.cookie, 'GET', 'overview')).json());
    expect(vue.alerts.open).toBe(3);
    expect(vue.daily).toHaveLength(14);
    expect(vue.daily.at(-1)).toMatchObject({ signups: 4 });
    expect(vue.daily.at(-1)?.active).toBeGreaterThanOrEqual(4); // bonus d'inscription de chacun
  });

  it('l’app se construit sur une base sans migrations : server.ts les applique juste après', () => {
    // Le 24/11, la table app_errors lue trop tôt a fait planter le serveur en production.
    expect(() => construireApp({ db: ouvrirBase(':memory:') })).not.toThrow();
  });

  it('journaux : activité, audit, erreurs 500 et tâches en erreur', async () => {
    const { app, db, chef, modo, alice } = await partie((a) =>
      a.get('/api/v1/boum', () => {
        throw new Error('panne de test');
      }),
    );
    expect((await app.inject({ url: '/api/v1/boum' })).statusCode).toBe(500);
    db.prepare(
      "INSERT INTO job_runs (job_name, status, finished_at, details) VALUES ('leaderboard', 'error', unixepoch(), 'disque plein')",
    ).run();

    const erreurs = journalErreursReponseSchema.parse(
      (await appel(app, modo.cookie, 'GET', 'logs/errors')).json(),
    ).rows;
    expect(erreurs.map((e) => [e.source, e.place, e.message]).sort()).toEqual([
      ['api', 'GET /api/v1/boum', 'panne de test'],
      ['job', 'leaderboard', 'disque plein'],
    ]);

    const activite = journalActiviteReponseSchema.parse(
      (await appel(app, modo.cookie, 'GET', 'logs/activity?q=ali')).json(),
    ).rows;
    expect(activite).toMatchObject([{ player: { id: alice.id, pseudo: 'Alice' }, reason: 'signup_bonus' }]);
    const parNumero = await appel(app, modo.cookie, 'GET', `logs/activity?q=${chef.id}`);
    expect(journalActiviteReponseSchema.parse(parNumero.json()).rows).toHaveLength(1);

    await appel(app, chef.cookie, 'GET', 'export/players');
    const audit = journalAuditReponseSchema.parse((await appel(app, modo.cookie, 'GET', 'logs/audit?q=export')).json());
    expect(audit.rows).toMatchObject([
      { actor: 'Chef', action: 'export.csv', targetType: 'export', targetId: 'players' },
    ]);
  });

  it('CSV pour Excel en français : « ; », BOM, guillemets, et pas de formule venue d’un pseudo', async () => {
    expect(
      versCsv(
        ['a', 'b'],
        [
          [1, '=SOMME(A1)'],
          [-5, 'dit "oui"; non'],
          [null, '@x'],
        ],
      ),
    ).toBe('﻿a;b\r\n1;\'=SOMME(A1)\r\n-5;"dit ""oui""; non"\r\n;\'@x\r\n');

    const { app, chef } = await partie();
    const r = await appel(app, chef.cookie, 'GET', 'export/players');
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="kadastr-players-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lignes = r.body.split('\r\n');
    expect(lignes[0]).toBe('﻿n°;pseudo;e-mail;grade;statut;suspendu jusqu’au;₮;gemmes;communes;inscrit le;actif le');
    expect(lignes[1]).toMatch(
      /^\d+;Chef;chef@dev\.invalid;admin;active;;\d+;\d+;0;\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2};/,
    );
    expect(lignes[2]).toMatch(/;Modo;modo@dev\.invalid;moderator;/);
  });
});
