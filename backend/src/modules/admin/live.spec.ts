import {
  cadeauReponseSchema,
  erreurApiSchema,
  etatSiteSchema,
  listeSignalementsReponseSchema,
  vueEnsembleReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type App, construireApp } from '../../app.ts';
import { baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

/** « Chef » admin d'office, « Modo » modérateur, Alice et Bruno joueurs. */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 300 },
  ]);
  const app = construireApp({ db, auth: { devLogin: true }, adminEmails: ['chef@dev.invalid'] });
  const chef = await connecter(app, 'Chef');
  const modo = await connecter(app, 'Modo');
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);
  return { app, chef, modo, alice, bruno };
}

type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH';
const appel = (app: App, cookie: string, method: Methode, url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1/${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

const etat = async (app: App) => etatSiteSchema.parse((await app.inject({ url: '/api/v1/status' })).json());
const notifs = (app: App, id: number, kind: string) =>
  app.db
    .prepare<[number, string], string>('SELECT payload FROM notifications WHERE user_id = ? AND kind = ?')
    .pluck()
    .all(id, kind)
    .map((p) => JSON.parse(p));
const nbAudit = (app: App, action: string) =>
  app.db.prepare('SELECT count(*) FROM admin_audit WHERE action = ?').pluck().get(action);

describe('dashboard /admin : contrôle live et signalements', () => {
  it('maintenance : le joueur regarde sans agir, l’équipe passe, le signalement reste ouvert', async () => {
    const { app, chef, modo, alice } = await partie();
    const poser = (cookie: string, message: string | null) =>
      appel(app, cookie, 'PUT', 'admin/site/maintenance', { message });

    expect((await poser(modo.cookie, 'Réglage')).statusCode).toBe(403);
    expect((await poser(chef.cookie, 'Mise à jour du serveur')).statusCode).toBe(204);
    expect((await etat(app)).maintenance).toBe('Mise à jour du serveur');

    const refus = await appel(app, alice.cookie, 'POST', 'territories/01004/buy');
    expect(refus.statusCode).toBe(503);
    expect(erreurApiSchema.parse(refus.json()).error).toMatchObject({
      code: 'MAINTENANCE',
      message: 'Maintenance en cours : Mise à jour du serveur',
    });
    expect((await appel(app, alice.cookie, 'GET', 'territories/01004')).statusCode).toBe(200);
    expect((await appel(app, alice.cookie, 'POST', 'reports', { body: 'La carte clignote.' })).statusCode).toBe(204);
    expect((await appel(app, modo.cookie, 'POST', 'territories/01004/buy')).statusCode).toBe(200);

    expect((await poser(chef.cookie, null)).statusCode).toBe(204);
    expect((await etat(app)).maintenance).toBeNull();
    expect((await appel(app, alice.cookie, 'POST', 'territories/01004/buy')).statusCode).not.toBe(503);
    expect(nbAudit(app, 'site.maintenance')).toBe(2);
  });

  it('bannière : visible pour tous, disparaît à son échéance, sans fin si pas de durée', async () => {
    const { app, chef, modo } = await partie();
    const poser = (cookie: string, text: string | null, hours: number | null) =>
      appel(app, cookie, 'PUT', 'admin/site/banner', { text, hours });

    expect((await poser(modo.cookie, 'Bonjour', 1)).statusCode).toBe(403);
    expect((await poser(chef.cookie, 'Week-end double revenu', 2)).statusCode).toBe(204);
    const { banner } = await etat(app);
    expect(banner?.text).toBe('Week-end double revenu');
    expect(banner?.until).toBeGreaterThan(Date.now() / 1000 + 7_000);

    app.db.prepare('UPDATE site_status SET banner_until = unixepoch() - 1').run();
    expect((await etat(app)).banner).toBeNull();

    expect((await poser(chef.cookie, 'Bienvenue', null)).statusCode).toBe(204);
    expect((await etat(app)).banner).toEqual({ text: 'Bienvenue', until: null });
    expect((await poser(chef.cookie, null, null)).statusCode).toBe(204);
    expect((await etat(app)).banner).toBeNull();
  });

  it('cadeaux : à un joueur ou à tous les actifs, par le journal, avec un message ; jamais à soi', async () => {
    const { app, chef, modo, alice, bruno } = await partie();
    const offrir = (cookie: string, corps: object) =>
      appel(app, cookie, 'POST', 'admin/gifts', {
        currency: 'gems',
        amount: 5,
        reason: 'Merci pour la bêta',
        ...corps,
      });
    const gemmes = (id: number) => app.db.prepare('SELECT premium_currency FROM users WHERE id = ?').pluck().get(id);
    const avant = { alice: gemmes(alice.id) as number, bruno: gemmes(bruno.id) as number };

    expect((await offrir(modo.cookie, { playerId: alice.id })).statusCode).toBe(403);
    expect((await offrir(chef.cookie, { playerId: chef.id })).statusCode).toBe(403);
    expect((await offrir(chef.cookie, { playerId: 9_999 })).statusCode).toBe(404);

    const un = await offrir(chef.cookie, { playerId: alice.id });
    expect(cadeauReponseSchema.parse(un.json())).toEqual({ count: 1 });
    expect(gemmes(alice.id)).toBe(avant.alice + 5);
    expect(gemmes(bruno.id)).toBe(avant.bruno);

    app.db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(bruno.id);
    const tous = await offrir(chef.cookie, { currency: 'cash', amount: 1_000 });
    expect(cadeauReponseSchema.parse(tous.json())).toEqual({ count: 2 }); // Modo et Alice ; ni Chef ni Bruno banni
    expect(notifs(app, alice.id, 'gift_received')).toEqual([
      { currency: 'gems', amount: 5, message: 'Merci pour la bêta' },
      { currency: 'cash', amount: 1_000, message: 'Merci pour la bêta' },
    ]);
    expect(notifs(app, bruno.id, 'gift_received')).toEqual([]);
    const journal = app.db
      .prepare("SELECT count(*) FROM wallet_transactions WHERE reason = 'admin_adjustment' AND user_id = ?")
      .pluck()
      .get(alice.id);
    expect(journal).toBe(2);
    expect(nbAudit(app, 'gift.send')).toBe(2);
  });

  it('signalements : 5 par jour, suivi par l’équipe, le joueur prévenu à la clôture', async () => {
    const { app, chef, modo, alice } = await partie();
    const signaler = (body: string) => appel(app, alice.cookie, 'POST', 'reports', { body, page: '/carte' });
    for (let i = 1; i <= 5; i++) expect((await signaler(`Bug numéro ${i} sur la carte`)).statusCode).toBe(204);
    const trop = await signaler('Un sixième bug ce jour');
    expect(trop.statusCode).toBe(429);
    expect(erreurApiSchema.parse(trop.json()).error.code).toBe('RATE_LIMITED');
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { body: 'Sans compte ici' } })).statusCode,
    ).toBe(401);

    const vue = vueEnsembleReponseSchema.parse((await appel(app, modo.cookie, 'GET', 'admin/overview')).json());
    expect(vue.reports.open).toBe(5);

    const liste = async (status: string) =>
      listeSignalementsReponseSchema.parse(
        (await appel(app, modo.cookie, 'GET', `admin/reports?status=${status}`)).json(),
      ).reports;
    const ouverts = await liste('open');
    expect(ouverts).toHaveLength(5);
    expect(ouverts[0]).toMatchObject({ player: { id: alice.id, pseudo: 'Alice' }, page: '/carte', staffNote: null });
    expect((await appel(app, alice.cookie, 'GET', 'admin/reports')).statusCode).toBe(403);

    const id = ouverts[0]?.id;
    const maj = (cookie: string, status: string, note: string | null) =>
      appel(app, cookie, 'PATCH', `admin/reports/${id}`, { status, note });
    expect((await maj(modo.cookie, 'in_progress', 'Je regarde')).statusCode).toBe(204);
    expect(notifs(app, alice.id, 'report_closed')).toEqual([]);
    expect((await maj(modo.cookie, 'resolved', 'Corrigé')).statusCode).toBe(204);
    expect((await maj(chef.cookie, 'rejected', 'Finalement non')).statusCode).toBe(204); // déjà clos : pas de 2e message
    expect(notifs(app, alice.id, 'report_closed')).toEqual([
      { reportId: id, status: 'resolved', excerpt: ouverts[0]?.body },
    ]);
    expect(await liste('rejected')).toMatchObject([{ id, staffNote: 'Finalement non' }]);
    expect(
      (await appel(app, modo.cookie, 'PATCH', 'admin/reports/9999', { status: 'resolved', note: null })).statusCode,
    ).toBe(404);
    expect(nbAudit(app, 'report.update')).toBe(3);
  });
});
