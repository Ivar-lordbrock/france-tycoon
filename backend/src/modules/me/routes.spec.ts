import { moiReponseSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

describe('PATCH /api/v1/me', () => {
  it('change le pseudo et la couleur du marqueur', async () => {
    const app = appDeTest();
    const { cookie } = await connecter(app, 'Alice');

    const reponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { cookie },
      payload: { pseudo: '  Reine des Alpes ', markerColor: '#E11D48' },
    });

    expect(reponse.statusCode).toBe(200);
    expect(moiReponseSchema.parse(reponse.json()).user).toMatchObject({
      pseudo: 'Reine des Alpes',
      markerColor: '#e11d48',
    });
  });

  it('pseudo déjà pris (même avec d’autres majuscules) : 409 PSEUDO_TAKEN', async () => {
    const app = appDeTest();
    await connecter(app, 'Alice');
    const { cookie } = await connecter(app, 'Bob');

    const reponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { cookie },
      payload: { pseudo: 'ALICE' },
    });

    expect(reponse.statusCode).toBe(409);
    expect(reponse.json().error.code).toBe('PSEUDO_TAKEN');
  });

  it('garder son propre pseudo n’est pas un conflit', async () => {
    const app = appDeTest();
    const { cookie } = await connecter(app, 'Alice');

    const reponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { cookie },
      payload: { pseudo: 'alice' },
    });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().user.pseudo).toBe('alice');
  });

  it('refuse un pseudo trop court, une couleur invalide ou un corps vide (400)', async () => {
    const app = appDeTest();
    const { cookie } = await connecter(app, 'Alice');

    for (const payload of [{ pseudo: 'ab' }, { markerColor: 'rouge' }, {}, { pseudo: '<script>' }]) {
      const reponse = await app.inject({ method: 'PATCH', url: '/api/v1/me', headers: { cookie }, payload });
      expect(reponse.statusCode, JSON.stringify(payload)).toBe(400);
      expect(reponse.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('sans connexion : 401', async () => {
    const reponse = await appDeTest().inject({ method: 'PATCH', url: '/api/v1/me', payload: { pseudo: 'Alice' } });

    expect(reponse.statusCode).toBe(401);
  });
});

describe('GET /api/v1/me : revenu et territoires', () => {
  it('additionne le revenu du sol (1 % de V0) des territoires possédés', async () => {
    const db = baseDeTest();
    insererCommunes(db, [
      { insee: '01001', nom: 'L’Abergement-Clémenciat', valeur: 21_800 },
      { insee: '50353', nom: 'Le Mont-Saint-Michel', valeur: 93_600 },
    ]);
    const app = appDeTest(db);
    const { cookie, id } = await connecter(app, 'Alice');
    db.prepare('UPDATE territories SET owner_id = ?').run(id);

    const reponse = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });

    expect(reponse.json()).toMatchObject({ incomePerHour: 218 + 936, territories: { owned: 2, max: 3 } });
  });
});
