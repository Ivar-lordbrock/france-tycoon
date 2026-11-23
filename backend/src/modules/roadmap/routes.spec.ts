import { feuilleDeRouteReponseSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appliquerMigrations, lireMigrations } from '../../db/migrations.ts';
import { appDeTest, baseDeTest } from '../../outils-test/base.ts';

const CODES = ['intercommunalite', 'jumelage', 'saisons', 'gemmes', 'aleas'];

describe('GET /roadmap', () => {
  it('renvoie les 5 fonctionnalités prévues, dans l’ordre, sans être connecté', async () => {
    const reponse = await appDeTest().inject({ method: 'GET', url: '/api/v1/roadmap' });

    expect(reponse.statusCode).toBe(200);
    const { features } = feuilleDeRouteReponseSchema.parse(reponse.json());
    expect(features.map((f) => f.code)).toEqual(CODES);
    expect(features.map((f) => f.category)).toEqual(['social', 'social', 'gameplay', 'economy', 'gameplay']);
    expect(features.every((f) => f.status === 'planned' && f.details.length >= 2)).toBe(true);
  });

  it('ni un redémarrage ni la migration 009 rejouée ne créent de doublon', () => {
    const db = baseDeTest();
    appliquerMigrations(db);
    db.exec(lireMigrations().find((m) => m.version === '009')?.sql ?? '');

    expect(db.prepare('SELECT code FROM roadmap_features ORDER BY position').pluck().all()).toEqual(CODES);
  });
});
