import { etatSiteSchema, ficheCommuneSchema, reglagesAdminReponseSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type App, construireApp } from '../../app.ts';
import { baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

/** « Chef » admin d'office, « Modo » modérateur, Alice joueuse. Commune libre à 30 000 ₮. */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const app = construireApp({ db, auth: { devLogin: true }, adminEmails: ['chef@dev.invalid'] });
  const chef = await connecter(app, 'Chef');
  const modo = await connecter(app, 'Modo');
  const alice = await connecter(app, 'Alice');
  db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);
  return { app, db, chef, modo, alice };
}

type Methode = 'GET' | 'POST' | 'PUT';
const appel = (app: App, cookie: string, method: Methode, url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1/${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
const etat = async (app: App) => etatSiteSchema.parse((await app.inject({ url: '/api/v1/status' })).json());
const lire = async (app: App, cookie: string) =>
  reglagesAdminReponseSchema.parse((await appel(app, cookie, 'GET', 'admin/live-config')).json());
const nbAudit = (app: App, action: string) =>
  app.db.prepare('SELECT count(*) FROM admin_audit WHERE action = ?').pluck().get(action);
const mouvement = (app: App, id: number, reason: string) =>
  app.db
    .prepare('SELECT amount FROM wallet_transactions WHERE user_id = ? AND reason = ? ORDER BY id DESC LIMIT 1')
    .pluck()
    .get(id, reason);
const maintenant = () => Math.floor(Date.now() / 1000);

const REGLAGES = { price: 50, income: 200, building: 200, reason: 'Semaine de lancement' };
const EVENEMENT = { title: 'Week-end doré', price: 100, income: 300, building: 100, hours: 2 };

describe('dashboard /admin : réglages à chaud et événements', () => {
  it('droits : le joueur ne voit rien, le modérateur lit sans changer, l’admin change et c’est audité', async () => {
    const { app, chef, modo, alice } = await partie();
    const essais: [Methode, string, object | undefined][] = [
      ['GET', 'admin/live-config', undefined],
      ['PUT', 'admin/live-config', REGLAGES],
      ['POST', 'admin/events', EVENEMENT],
      ['POST', 'admin/events/1/cancel', undefined],
    ];
    for (const [m, url, corps] of essais) {
      expect((await appel(app, alice.cookie, m, url, corps)).statusCode).toBe(403);
      expect((await appel(app, modo.cookie, m, url, corps)).statusCode).toBe(m === 'GET' ? 200 : 403);
    }
    expect((await etat(app)).settings).toEqual({ price: 100, income: 100, building: 100 });

    expect((await appel(app, chef.cookie, 'PUT', 'admin/live-config', REGLAGES)).statusCode).toBe(204);
    const r = await lire(app, modo.cookie);
    expect(r.base).toEqual({ price: 50, income: 200, building: 200 });
    expect(r.effective).toEqual(r.base);
    expect(r.versions).toMatchObject([{ price: 50, reason: 'Semaine de lancement', by: 'Chef' }]);
    expect((await etat(app)).settings).toEqual(r.base);
    expect(nbAudit(app, 'config.update')).toBe(1);
    const hors = { ...REGLAGES, price: 401 };
    expect((await appel(app, chef.cookie, 'PUT', 'admin/live-config', hors)).statusCode).toBe(400);
  });

  it('le joueur paie le prix réglé et le coût réglé des bâtiments ; l’annulation rend ce qu’il a payé', async () => {
    const { app, db, chef, alice } = await partie();
    await appel(app, chef.cookie, 'PUT', 'admin/live-config', REGLAGES);

    const fiche = ficheCommuneSchema.parse((await appel(app, alice.cookie, 'GET', 'territories/01004')).json());
    expect(fiche.actions.buyPrice).toBe(15_000);
    expect((await appel(app, alice.cookie, 'POST', 'territories/01004/buy')).statusCode).toBe(200);
    expect(mouvement(app, alice.id, 'territory_purchase')).toBe(-15_000);

    // Résidence niveau 1 : 3 000 × √3 ≈ 5 200 ₮, × 200 %.
    db.prepare('UPDATE users SET cash = 100000 WHERE id = ?').run(alice.id);
    const chantier = await appel(app, alice.cookie, 'POST', 'territories/01004/buildings', { typeCode: 'residence' });
    expect(chantier.statusCode).toBe(200);
    expect(mouvement(app, alice.id, 'building_construction')).toBe(-10_400);
    const id = chantier.json().building.id as number;
    expect((await appel(app, alice.cookie, 'POST', `buildings/${id}/cancel`)).statusCode).toBe(200);
    expect(db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(alice.id)).toBe(100_000);
  });

  it('événement : il s’ajoute aux réglages, se voit dans /status, s’annule, et finit tout seul', async () => {
    const { app, db, chef } = await partie();
    await appel(app, chef.cookie, 'PUT', 'admin/live-config', REGLAGES);
    // Un début dans le passé part de maintenant : pas de revenus gonflés après coup.
    const avant = maintenant();
    const cree = await appel(app, chef.cookie, 'POST', 'admin/events', { ...EVENEMENT, startsAt: 1 });
    expect(cree.statusCode).toBe(204);
    const s = await etat(app);
    expect(s.settings).toEqual({ price: 50, income: 600, building: 200 });
    expect(s.events).toMatchObject([{ title: 'Week-end doré', income: 300 }]);
    expect(s.events[0]?.endsAt).toBeGreaterThanOrEqual(avant + 2 * 3_600);

    const [ev] = (await lire(app, chef.cookie)).events;
    expect(ev).toMatchObject({ status: 'active', by: 'Chef' });
    expect(ev?.startsAt).toBeGreaterThanOrEqual(avant);
    expect((await appel(app, chef.cookie, 'POST', `admin/events/${ev?.id}/cancel`)).statusCode).toBe(204);
    expect((await etat(app)).events).toEqual([]);
    expect((await etat(app)).settings.income).toBe(200);
    expect((await appel(app, chef.cookie, 'POST', `admin/events/${ev?.id}/cancel`)).statusCode).toBe(409);
    expect(nbAudit(app, 'event.create')).toBe(1);
    expect(nbAudit(app, 'event.cancel')).toBe(1);

    // Fin automatique : un événement dont la date de fin est passée ne compte plus, sans rien faire.
    const t = maintenant();
    db.prepare(`INSERT INTO game_events (title, price_pct, income_pct, building_pct, starts_at, ends_at)
      VALUES ('Fini', 100, 400, 100, ?, ?), ('Bientôt', 100, 400, 100, ?, ?)`).run(
      t - 7_200,
      t - 3_600,
      t + 3_600,
      t + 7_200,
    );
    expect((await etat(app)).events).toEqual([]);
    const statuts = (await lire(app, chef.cookie)).events.map((e) => [e.title, e.status]);
    expect(statuts).toEqual(
      expect.arrayContaining([
        ['Fini', 'ended'],
        ['Bientôt', 'upcoming'],
        ['Week-end doré', 'cancelled'],
      ]),
    );
    const loin = { ...EVENEMENT, startsAt: t + 91 * 86_400 };
    expect((await appel(app, chef.cookie, 'POST', 'admin/events', loin)).statusCode).toBe(400);
  });
});
