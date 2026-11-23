import { erreurApiSchema, santeReponseSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest, baseDeTest } from '../../outils-test/base.ts';

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
    expect(corps.database).toEqual({ ok: true, schemaVersion: '008', territories: 0 });
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

describe('erreurs', () => {
  it('route inconnue → 404 au format commun', async () => {
    const reponse = await appDeTest().inject({ method: 'GET', url: '/api/v1/nulle-part?x=1' });
    expect(reponse.statusCode).toBe(404);
    const corps = erreurApiSchema.parse(reponse.json());
    expect(corps.error.code).toBe('NOT_FOUND');
    expect(corps.error.message).toBe('Route inconnue : GET /api/v1/nulle-part');
  });
});
