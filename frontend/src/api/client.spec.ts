import { describe, expect, it, vi } from 'vitest';
import { ErreurApi, envoyerJson, lireJson, messageErreur, nouvelleCle } from './client.ts';

const reponse = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });

describe('client de l’API', () => {
  it('renvoie le JSON d’une réponse 200', async () => {
    const appel = vi.fn(async () => reponse(200, { zones: [] }));
    await expect(lireJson('/api/v1/map/zones', undefined, appel)).resolves.toEqual({ zones: [] });
    expect(appel).toHaveBeenCalledWith(
      '/api/v1/map/zones',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('transforme une erreur de l’API en ErreurApi', async () => {
    const appel = async () => reponse(400, { error: { code: 'VALIDATION_ERROR', message: 'zoom 9 minimum' } });
    const erreur = await lireJson('/x', undefined, appel).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurApi);
    expect(erreur).toMatchObject({ statut: 400, code: 'VALIDATION_ERROR', message: 'zoom 9 minimum' });
  });

  it('garde un message clair si la réponse n’est pas au format attendu', async () => {
    const appel = async () => new Response('Bad Gateway', { status: 502 });
    await expect(lireJson('/x', undefined, appel)).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      message: 'Le serveur a répondu 502.',
    });
  });

  it('envoie la clé Idempotency-Key quand on la donne', async () => {
    const appel = vi.fn(async () => reponse(200, { ok: true }));
    await envoyerJson('/api/v1/territories/01001/buy', 'POST', undefined, { cle: 'achat-0001', appel });
    expect(appel).toHaveBeenCalledWith(
      '/api/v1/territories/01001/buy',
      expect.objectContaining({
        method: 'POST',
        headers: { accept: 'application/json', 'idempotency-key': 'achat-0001' },
        body: undefined,
      }),
    );
  });

  it('fabrique des clés différentes, acceptées par le serveur (8 à 100 caractères)', () => {
    const a = nouvelleCle();
    expect(a).toMatch(/^[\w-]{8,100}$/);
    expect(nouvelleCle()).not.toBe(a);
  });

  it('montre le message du serveur, ou une phrase simple si le serveur ne répond pas', () => {
    expect(messageErreur(new ErreurApi(409, 'INSUFFICIENT_FUNDS', 'Il manque 1 200 ₮'))).toBe('Il manque 1 200 ₮');
    expect(messageErreur(new TypeError('Failed to fetch'))).toMatch(/^Le serveur ne répond pas/);
  });
});
