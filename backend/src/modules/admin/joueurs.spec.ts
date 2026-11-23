import { erreurApiSchema, ficheJoueurReponseSchema, listeJoueursReponseSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type App, construireApp } from '../../app.ts';
import { baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

// « Chef » → chef@dev.invalid : admin d'office. « Modo » : modérateur par staff_roles.
async function equipe(options: { ipSalt?: string } = {}) {
  const app = construireApp({
    db: baseDeTest(),
    auth: { devLogin: true, ...options },
    adminEmails: ['chef@dev.invalid'],
  });
  const chef = await connecter(app, 'Chef');
  const modo = await connecter(app, 'Modo');
  const joueur = await connecter(app, 'Simple Joueur');
  app.db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);
  return { app, chef, modo, joueur };
}

const appel = (
  app: App,
  cookie: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) => app.inject({ method, url: `/api/v1/admin/${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

const motif = { reason: 'Test de modération' };
const nbAudit = (app: App, action: string) =>
  app.db.prepare('SELECT count(*) FROM admin_audit WHERE action = ?').pluck().get(action);

describe('dashboard /admin : vue Joueurs', () => {
  it('recherche : pseudo, filtre de grade (ADMIN_EMAILS compris), refusée au joueur', async () => {
    const { app, chef, modo, joueur } = await equipe();

    const tous = listeJoueursReponseSchema.parse((await appel(app, modo.cookie, 'GET', 'players')).json());
    expect(tous.players.map((p) => p.pseudo).sort()).toEqual(['Chef', 'Modo', 'Simple Joueur']);

    const parPseudo = (await appel(app, modo.cookie, 'GET', 'players?q=simple')).json();
    expect(parPseudo.players.map((p: { id: number }) => p.id)).toEqual([joueur.id]);

    const admins = (await appel(app, modo.cookie, 'GET', 'players?role=admin')).json();
    expect(admins.players).toMatchObject([{ id: chef.id, role: 'admin', roleFixe: true }]);

    // « % » est cherché tel quel, pas comme joker.
    expect((await appel(app, modo.cookie, 'GET', 'players?q=%25')).json().players).toEqual([]);
    expect((await appel(app, joueur.cookie, 'GET', 'players')).statusCode).toBe(403);
  });

  it('modérateur : notes et suspension oui ; actions d’admin et cible de même grade non', async () => {
    const { app, chef, modo, joueur } = await equipe();
    await connecter(app, 'Autre Modo').then(({ id }) =>
      app.db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(id),
    );
    const autreModo = app.db.prepare("SELECT id FROM users WHERE pseudo = 'Autre Modo'").pluck().get() as number;

    expect(
      (await appel(app, modo.cookie, 'POST', `players/${joueur.id}/notes`, { body: 'À surveiller' })).statusCode,
    ).toBe(204);
    const suspendu = await appel(app, modo.cookie, 'POST', `players/${joueur.id}/suspend`, { hours: 24, ...motif });
    expect(suspendu.statusCode).toBe(204);

    for (const [method, url, corps] of [
      ['POST', `players/${joueur.id}/ban`, motif],
      ['PUT', `players/${joueur.id}/role`, { role: 'moderator', ...motif }],
      ['POST', `players/${joueur.id}/reset`, motif],
      ['POST', `players/${joueur.id}/adjust`, { currency: 'cash', amount: 100, ...motif }],
    ] as const) {
      const refus = await appel(app, modo.cookie, method, url, corps);
      expect(refus.statusCode, url).toBe(403);
      expect(erreurApiSchema.parse(refus.json()).error.message).toBe('Réservé aux admins.');
    }
    expect(
      (await appel(app, modo.cookie, 'POST', `players/${autreModo}/suspend`, { hours: 1, ...motif })).statusCode,
    ).toBe(403);
    expect(
      (await appel(app, modo.cookie, 'POST', `players/${chef.id}/suspend`, { hours: 1, ...motif })).statusCode,
    ).toBe(403);
    expect(
      (await appel(app, modo.cookie, 'POST', `players/${modo.id}/suspend`, { hours: 1, ...motif })).statusCode,
    ).toBe(403);

    const fiche = ficheJoueurReponseSchema.parse((await appel(app, modo.cookie, 'GET', `players/${joueur.id}`)).json());
    expect(fiche.player.suspensionReason).toBe('Test de modération');
    expect(fiche.notes).toMatchObject([{ body: 'À surveiller', author: 'Modo' }]);
    expect(fiche.audit.map((l) => l.action)).toEqual(['player.suspend', 'note.add']);
  });

  it('joueur suspendu : il lit, mais toute action est refusée avec le motif', async () => {
    const { app, modo, joueur } = await equipe();
    insererCommunes(app.db, [{ insee: '42001', nom: 'Lisible' }]);
    await appel(app, modo.cookie, 'POST', `players/${joueur.id}/suspend`, { hours: 2, ...motif });

    const lecture = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: joueur.cookie } });
    expect(lecture.statusCode).toBe(200);
    const achat = await app.inject({
      method: 'POST',
      url: '/api/v1/territories/42001/buy',
      headers: { cookie: joueur.cookie },
    });
    expect(achat.statusCode).toBe(403);
    const erreur = erreurApiSchema.parse(achat.json()).error;
    expect(erreur.code).toBe('ACCOUNT_SUSPENDED');
    expect(erreur.message).toContain('Motif : Test de modération');

    await appel(app, modo.cookie, 'POST', `players/${joueur.id}/unsuspend`, motif);
    const rachat = await app.inject({
      method: 'POST',
      url: '/api/v1/territories/42001/buy',
      headers: { cookie: joueur.cookie },
    });
    expect(rachat.statusCode).toBe(200);
  });

  it('admin : bannir coupe la session ; grade ; ADMIN_EMAILS intouchable', async () => {
    const { app, chef, modo, joueur } = await equipe();

    expect((await appel(app, chef.cookie, 'POST', `players/${joueur.id}/ban`, motif)).statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: joueur.cookie } })).statusCode,
    ).toBe(401);
    expect((await appel(app, chef.cookie, 'POST', `players/${joueur.id}/unban`, motif)).statusCode).toBe(204);

    expect(
      (await appel(app, chef.cookie, 'PUT', `players/${modo.id}/role`, { role: 'player', ...motif })).statusCode,
    ).toBe(204);
    expect((await appel(app, modo.cookie, 'GET', 'me')).statusCode).toBe(403);

    // Un admin donné par l'écran ne touche pas à l'admin d'office.
    await appel(app, chef.cookie, 'PUT', `players/${modo.id}/role`, { role: 'admin', ...motif });
    const refus = await appel(app, modo.cookie, 'PUT', `players/${chef.id}/role`, { role: 'player', ...motif });
    expect(refus.statusCode).toBe(403);
    expect(nbAudit(app, 'player.role')).toBe(2);
    expect(nbAudit(app, 'player.ban')).toBe(1);
  });

  it('reset partiel : communes libérées, argent gardé ; ajustement par le journal des transactions', async () => {
    const { app, chef, joueur } = await equipe();
    insererCommunes(app.db, [{ insee: '42001', nom: 'Rasée' }]);
    app.db
      .prepare("UPDATE territories SET owner_id = ?, acquired_at = unixepoch() WHERE insee_code = '42001'")
      .run(joueur.id);
    const cash = () => app.db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(joueur.id) as number;
    const avant = cash();

    expect((await appel(app, chef.cookie, 'POST', `players/${joueur.id}/reset`, motif)).statusCode).toBe(204);
    expect(app.db.prepare('SELECT count(*) FROM territories WHERE owner_id = ?').pluck().get(joueur.id)).toBe(0);
    expect(cash()).toBeGreaterThanOrEqual(avant);

    const plus = await appel(app, chef.cookie, 'POST', `players/${joueur.id}/adjust`, {
      currency: 'cash',
      amount: 500,
      ...motif,
    });
    expect(plus.statusCode).toBe(204);
    const trop = await appel(app, chef.cookie, 'POST', `players/${joueur.id}/adjust`, {
      currency: 'gems',
      amount: -1_000_000,
      ...motif,
    });
    expect(trop.statusCode).toBe(409);
    expect(
      app.db
        .prepare("SELECT amount FROM wallet_transactions WHERE user_id = ? AND reason = 'admin_adjustment'")
        .pluck()
        .all(joueur.id),
    ).toEqual([500]);
    // Refusé = annulé : pas de ligne d'audit pour l'ajustement raté.
    expect(nbAudit(app, 'player.adjust')).toBe(1);
    expect(
      (await appel(app, chef.cookie, 'POST', `players/${chef.id}/adjust`, { currency: 'cash', amount: 1, ...motif }))
        .statusCode,
    ).toBe(403);
  });

  it('journal d’audit en ajout seul ; connexions notées seulement avec un sel', async () => {
    const sansSel = await equipe();
    expect(sansSel.app.db.prepare('SELECT count(*) FROM login_events').pluck().get()).toBe(0);

    const { app, chef, joueur } = await equipe({ ipSalt: 'sel-de-test' });
    const traces = app.db.prepare('SELECT ip_hash, ua_hash FROM login_events WHERE user_id = ?').all(joueur.id);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ ip_hash: expect.stringMatching(/^[0-9a-f]{16}$/) });

    await appel(app, chef.cookie, 'POST', `players/${joueur.id}/notes`, { body: 'Note' });
    expect(() => app.db.exec('UPDATE admin_audit SET reason = NULL')).toThrow(/ajout seul/);
    expect(() => app.db.exec('DELETE FROM admin_audit')).toThrow(/ajout seul/);
  });
});
