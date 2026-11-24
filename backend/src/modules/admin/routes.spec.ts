import {
  adminMoiReponseSchema,
  erreurApiSchema,
  santeReponseSchema,
  vueEnsembleReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type App, construireApp } from '../../app.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

describe('GET /api/v1/admin/health', () => {
  it('répond ok avec la version du schéma et les dernières tâches', async () => {
    const db = baseDeTest();
    db.exec(`
      INSERT INTO job_runs (job_name, started_at, finished_at, status) VALUES
        ('leaderboard', 100, 110, 'ok'),
        ('leaderboard', 200, NULL, 'running'),
        ('cleanup', 50, 60, 'error');
    `);
    const app = appDeTest(db);

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/admin/health' });

    expect(reponse.statusCode).toBe(200);
    const corps = santeReponseSchema.parse(reponse.json());
    expect(corps.status).toBe('ok');
    expect(corps.database).toEqual({ ok: true, schemaVersion: '015', territories: 0 });
    expect(corps.jobs).toEqual([
      { name: 'cleanup', status: 'error', startedAt: 50, finishedAt: 60 },
      { name: 'leaderboard', status: 'running', startedAt: 200, finishedAt: null },
    ]);
  });

  it('répond 503 si la base est fermée', async () => {
    const db = baseDeTest();
    const app = appDeTest(db);
    await app.ready();
    db.close();

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/admin/health' });

    expect(reponse.statusCode).toBe(503);
    expect(reponse.json()).toMatchObject({ status: 'degraded', database: { ok: false } });
  });
});

describe('dashboard /admin : qui entre', () => {
  // Connexion de test : « Chef » → chef@dev.invalid, admin d'office (majuscules ignorées).
  const app = () => construireApp({ db: baseDeTest(), auth: { devLogin: true }, adminEmails: ['chef@dev.invalid'] });
  const lire = (a: App, url: string, cookie?: string) =>
    a.inject({ method: 'GET', url: `/api/v1/admin/${url}`, headers: cookie ? { cookie } : {} });

  it('sans session → 401 ; joueur → 403 explicite, sur chaque route', async () => {
    const a = app();
    const { cookie } = await connecter(a, 'Simple Joueur');
    for (const url of ['me', 'overview']) {
      expect((await lire(a, url)).statusCode).toBe(401);
      const refus = await lire(a, url, cookie);
      expect(refus.statusCode).toBe(403);
      expect(erreurApiSchema.parse(refus.json()).error).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('admin par ADMIN_EMAILS, modérateur par staff_roles ; un compte banni perd son grade', async () => {
    const a = app();
    const chef = await connecter(a, 'Chef');
    const modo = await connecter(a, 'Modo');
    a.db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);

    expect(adminMoiReponseSchema.parse((await lire(a, 'me', chef.cookie)).json())).toEqual({
      pseudo: 'Chef',
      grade: 'admin',
    });
    expect((await lire(a, 'me', modo.cookie)).json()).toEqual({ pseudo: 'Modo', grade: 'moderator' });

    // Banni : sa session ne vaut déjà plus rien, même avec un e-mail admin.
    a.db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(chef.id);
    expect((await lire(a, 'me', chef.cookie)).statusCode).toBe(401);
  });

  it('vue d’ensemble : joueurs actifs, communes par zone, soldes, revenu par heure, OPA, système', async () => {
    const a = app();
    insererCommunes(a.db, [
      { insee: '42001', nom: 'Alpha' },
      { insee: '42002', nom: 'Beta' },
      { insee: '97101', nom: 'Gamma', departement: '971', zone: 'GP' },
    ]);
    const chef = await connecter(a, 'Chef');
    const vieux = await connecter(a, 'Vieux');
    const maintenant = Math.floor(Date.now() / 1000);
    a.db
      .prepare('UPDATE users SET last_active_at = ?, cash = 100, premium_currency = 2 WHERE id = ?')
      .run(maintenant - 10 * 86_400, vieux.id);
    a.db.prepare("UPDATE territories SET owner_id = ? WHERE insee_code IN ('42001', '97101')").run(vieux.id);

    const reponse = await lire(a, 'overview', chef.cookie);

    expect(reponse.statusCode).toBe(200);
    const vue = vueEnsembleReponseSchema.parse(reponse.json());
    expect(vue.players).toEqual({ total: 2, active24h: 1, active7d: 1, active14d: 2 });
    expect(vue.territories).toEqual({ metropole: { total: 2, owned: 1 }, outreMer: { total: 1, owned: 1 } });
    const cashChef = a.db.prepare<[number], number>('SELECT cash FROM users WHERE id = ?').pluck().get(chef.id) ?? 0;
    expect(vue.economy).toMatchObject({ cash: cashChef + 100, gems: 2 });
    expect(vue.economy.incomePerHour).toBeGreaterThan(0); // le sol des deux communes rapporte
    expect(vue.takeovers).toEqual({ active: 0, finished: 0 });
    expect(vue.system.databaseBytes).toBeGreaterThan(0);
  });
});

describe('erreurs', () => {
  it('route inconnue → 404 au format commun', async () => {
    const reponse = await appDeTest().inject({ method: 'GET', url: '/api/v1/nulle-part?x=1' });
    expect(reponse.statusCode).toBe(404);
    const corps = erreurApiSchema.parse(reponse.json());
    expect(corps.error.code).toBe('NOT_FOUND');
    expect(corps.error.message).toBe('Route inconnue : GET /api/v1/nulle-part');
  });
});
