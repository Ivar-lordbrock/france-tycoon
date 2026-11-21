import { configConnexionSchema, connexionReponseSchema, moiReponseSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { lireConfig } from '../../config.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import type { IdentiteGoogle } from './google.ts';

const GOOGLE_OK: IdentiteGoogle = {
  sub: '1234567890',
  email: 'julie@gmail.com',
  emailVerifie: true,
  nom: 'Julie Martin',
  photo: 'https://lh3.googleusercontent.com/a/photo',
};

/** Faux Google : accepte seulement le jeton « bon-jeton ». */
const fauxGoogle = (identite: IdentiteGoogle) => async (credential: string) => {
  if (credential !== 'bon-jeton') throw new Error('signature invalide');
  return identite;
};

function appGoogle(identite = GOOGLE_OK, db = baseDeTest()) {
  return appDeTest(db, { googleClientId: 'client.apps.googleusercontent.com', verifierGoogle: fauxGoogle(identite) });
}

describe('GET /api/v1/auth/config', () => {
  it('dit si Google et la connexion de développement sont disponibles', async () => {
    const reponse = await appGoogle().inject({ method: 'GET', url: '/api/v1/auth/config' });

    expect(configConnexionSchema.parse(reponse.json())).toEqual({
      googleClientId: 'client.apps.googleusercontent.com',
      devLogin: true,
    });
  });
});

describe('POST /api/v1/auth/google', () => {
  it('crée le compte au premier passage : 30 000 ₮ via wallet.apply, protection 72 h, cookie HttpOnly', async () => {
    const db = baseDeTest();
    const app = appGoogle(GOOGLE_OK, db);
    const avant = Math.floor(Date.now() / 1000);

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'bon-jeton' },
    });

    expect(reponse.statusCode).toBe(200);
    const corps = connexionReponseSchema.parse(reponse.json());
    expect(corps.isNew).toBe(true);
    expect(corps.user).toMatchObject({ pseudo: 'Julie Martin', email: 'julie@gmail.com', avatarUrl: GOOGLE_OK.photo });
    const cookie = reponse.cookies.find((c) => c.name === 'sid');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 30 * 86_400 });
    expect(db.prepare('SELECT cash, newbie_shield_until - created_at AS protection FROM users').get()).toEqual({
      cash: 30_000,
      protection: 72 * 3_600,
    });
    expect(db.prepare('SELECT amount, balance_after, reason FROM wallet_transactions').all()).toEqual([
      { amount: 30_000, balance_after: 30_000, reason: 'signup_bonus' },
    ]);
    // La session est stockée hachée, jamais le jeton du cookie.
    const session = db.prepare('SELECT id, expires_at FROM sessions').get() as { id: string; expires_at: number };
    expect(session.id).not.toBe(cookie?.value);
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
    expect(session.expires_at).toBeGreaterThanOrEqual(avant + 30 * 86_400);
  });

  it('reconnexion : même compte, pas de second bonus', async () => {
    const db = baseDeTest();
    const app = appGoogle(GOOGLE_OK, db);
    await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { credential: 'bon-jeton' } });

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'bon-jeton' },
    });

    expect(reponse.json().isNew).toBe(false);
    expect(db.prepare('SELECT count(*) FROM users').pluck().get()).toBe(1);
    expect(db.prepare('SELECT count(*) FROM wallet_transactions').pluck().get()).toBe(1);
    expect(db.prepare('SELECT cash FROM users').pluck().get()).toBe(30_000);
  });

  it('pseudo déjà pris : on ajoute un numéro', async () => {
    const db = baseDeTest();
    await appGoogle(GOOGLE_OK, db).inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'bon-jeton' },
    });

    const autre = { ...GOOGLE_OK, sub: '999', email: 'autre@gmail.com' };
    const reponse = await appGoogle(autre, db).inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'bon-jeton' },
    });

    expect(reponse.json().user.pseudo).toBe('Julie Martin 2');
  });

  it('refuse un jeton invalide ou une adresse non vérifiée (401)', async () => {
    const mauvais = await appGoogle().inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'faux' },
    });
    const nonVerifie = await appGoogle({ ...GOOGLE_OK, emailVerifie: false }).inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'bon-jeton' },
    });

    expect(mauvais.statusCode).toBe(401);
    expect(mauvais.json().error.code).toBe('UNAUTHENTICATED');
    expect(nonVerifie.statusCode).toBe(401);
  });

  it('GOOGLE_CLIENT_ID vide : FEATURE_DISABLED', async () => {
    const reponse = await appDeTest().inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { credential: 'bon-jeton' },
    });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.json().error.code).toBe('FEATURE_DISABLED');
  });
});

describe('POST /api/v1/auth/dev (connexion de développement)', () => {
  it('crée un compte de test avec 30 000 ₮, et le même nom le retrouve', async () => {
    const db = baseDeTest();
    const app = appDeTest(db);

    const premier = await app.inject({ method: 'POST', url: '/api/v1/auth/dev', payload: { pseudo: 'Alice' } });
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/dev', payload: { pseudo: 'alice' } });

    expect(premier.json()).toMatchObject({ isNew: true, user: { pseudo: 'Alice', email: 'alice@dev.invalid' } });
    expect(second.json()).toMatchObject({ isNew: false, user: { id: premier.json().user.id } });
    expect(db.prepare('SELECT google_id, cash FROM users').all()).toEqual([{ google_id: 'dev:alice', cash: 30_000 }]);
  });

  it('n’existe pas quand AUTH_DEV est faux', async () => {
    const reponse = await appDeTest(baseDeTest(), { devLogin: false }).inject({
      method: 'POST',
      url: '/api/v1/auth/dev',
      payload: { pseudo: 'Alice' },
    });

    expect(reponse.statusCode).toBe(404);
  });

  it('la configuration refuse AUTH_DEV=true en production', () => {
    expect(() => lireConfig({ NODE_ENV: 'production', AUTH_DEV: 'true' })).toThrow(/AUTH_DEV/);
    expect(lireConfig({ NODE_ENV: 'production' }).AUTH_DEV).toBe(false);
    expect(lireConfig({ NODE_ENV: 'development', AUTH_DEV: 'true' }).AUTH_DEV).toBe(true);
  });
});

describe('session, GET /me et POST /auth/logout', () => {
  it('GET /me renvoie le profil et le portefeuille du joueur connecté', async () => {
    const app = appDeTest();
    const { cookie } = await connecter(app, 'Alice');

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });

    expect(reponse.statusCode).toBe(200);
    expect(moiReponseSchema.parse(reponse.json())).toMatchObject({
      user: { pseudo: 'Alice', markerColor: '#2563eb', avatarUrl: null },
      wallet: { cash: 30_000, gems: 0 },
      incomePerHour: 0,
      territories: { owned: 0, max: 4 },
      rankLevel: 0,
      buildQueueSlots: 1,
      unreadNotifications: 0,
    });
  });

  it('sans cookie, ou avec un cookie inconnu : 401 UNAUTHENTICATED', async () => {
    const app = appDeTest();

    const sans = await app.inject({ method: 'GET', url: '/api/v1/me' });
    const inconnu = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: 'sid=nimporte-quoi' } });

    expect(sans.statusCode).toBe(401);
    expect(sans.json().error.code).toBe('UNAUTHENTICATED');
    expect(inconnu.statusCode).toBe(401);
  });

  it('une session expirée ne connecte plus', async () => {
    const db = baseDeTest();
    const app = appDeTest(db);
    const { cookie } = await connecter(app, 'Alice');
    db.exec('UPDATE sessions SET expires_at = unixepoch() - 1');

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });

    expect(reponse.statusCode).toBe(401);
  });

  it('se prolonge à l’usage (au plus une écriture par jour)', async () => {
    const db = baseDeTest();
    const app = appDeTest(db);
    const { cookie } = await connecter(app, 'Alice');
    db.exec('UPDATE sessions SET expires_at = unixepoch() + 86400 * 5');

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });

    expect(reponse.cookies.find((c) => c.name === 'sid')?.maxAge).toBe(30 * 86_400);
    const reste = db.prepare('SELECT expires_at - unixepoch() FROM sessions').pluck().get() as number;
    expect(reste).toBeGreaterThan(29 * 86_400);
  });

  it('déconnexion : 204, session supprimée, cookie effacé', async () => {
    const db = baseDeTest();
    const app = appDeTest(db);
    const { cookie } = await connecter(app, 'Alice');

    const sortie = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    const apres = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });

    expect(sortie.statusCode).toBe(204);
    expect(sortie.cookies.find((c) => c.name === 'sid')?.value).toBe('');
    expect(db.prepare('SELECT count(*) FROM sessions').pluck().get()).toBe(0);
    expect(apres.statusCode).toBe(401);
  });
});
