import { describe, expect, it } from 'vitest';
import { construireApp } from './app.ts';
import { baseDeTest } from './outils-test/base.ts';
import { CONNEXIONS_PAR_MINUTE, REQUETES_PAR_MINUTE } from './securite.ts';

const ORIGINE = 'https://jeu.example';
const appSecurisee = () =>
  construireApp({ db: baseDeTest(), auth: { devLogin: true }, securite: { origine: ORIGINE } });
type AppSecurisee = ReturnType<typeof appSecurisee>;

async function connecter(app: AppSecurisee, pseudo: string): Promise<string> {
  const reponse = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/dev',
    headers: { origin: ORIGINE },
    payload: { pseudo },
  });
  expect(reponse.statusCode).toBe(200);
  return `sid=${reponse.cookies.find((c) => c.name === 'sid')?.value}`;
}

describe('contrôle Origin', () => {
  it('refuse ce qui modifie sans Origin ou depuis un autre site, accepte le jeu', async () => {
    const app = appSecurisee();
    for (const headers of [{}, { origin: 'https://pirate.example' }]) {
      const reponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/dev',
        headers,
        payload: { pseudo: 'Bob' },
      });
      expect(reponse.statusCode).toBe(403);
      expect(reponse.json().error.code).toBe('FORBIDDEN');
    }
    await connecter(app, 'Bob');
  });

  it('laisse passer les lectures sans Origin', async () => {
    const reponse = await appSecurisee().inject({ method: 'GET', url: '/api/v1/auth/config' });
    expect(reponse.statusCode).toBe(200);
  });
});

describe('limite de débit', () => {
  it(`bloque les connexions après ${CONNEXIONS_PAR_MINUTE} par minute, pas la lecture de la config`, async () => {
    const app = appSecurisee();
    const sortir = () => app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: ORIGINE } });
    // Sans session : 401, mais chaque essai compte.
    for (let i = 0; i < CONNEXIONS_PAR_MINUTE; i++) expect((await sortir()).statusCode).toBe(401);
    const refus = await sortir();
    expect(refus.statusCode).toBe(429);
    expect(refus.json().error.code).toBe('RATE_LIMITED');
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/config' })).statusCode).toBe(200);
  });

  it(`compte ${REQUETES_PAR_MINUTE} requêtes par minute et par joueur, sans gêner les autres`, async () => {
    const app = appSecurisee();
    const alice = await connecter(app, 'Alice');
    const bob = await connecter(app, 'Bob');
    const lire = (cookie: string) =>
      app.inject({ method: 'GET', url: '/api/v1/building-types', headers: { cookie } }).then((r) => r.statusCode);

    for (let i = 0; i < REQUETES_PAR_MINUTE; i++) expect(await lire(alice)).toBe(200);
    expect(await lire(alice)).toBe(429);
    expect(await lire(bob)).toBe(200);
  });
});
