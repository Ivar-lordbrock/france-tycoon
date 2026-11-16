import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { creerClientApiGeo } from './api-geo.ts';

const dossiers: string[] = [];
function dossierCache(): string {
  const dossier = mkdtempSync(join(tmpdir(), 'ft-api-geo-'));
  dossiers.push(dossier);
  return dossier;
}
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Horloge simulée : `attendre` avance le temps au lieu de dormir. */
function horlogeSimulee() {
  let t = 0;
  const attentes: number[] = [];
  return {
    maintenant: () => t,
    attendre: async (ms: number) => {
      attentes.push(ms);
      t += ms;
    },
    avancer: (ms: number) => {
      t += ms;
    },
    attentes,
  };
}

const reponseJson = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status });

describe('client API Geo', () => {
  it('garde les réponses dans le cache et ne re-télécharge pas', async () => {
    const cache = dossierCache();
    const fetch = vi.fn(async () => reponseJson([{ code: '01', nom: 'Ain', codeRegion: '84' }]));
    const horloge = horlogeSimulee();

    const client = creerClientApiGeo({ dossierCache: cache, fetch, ...horloge });
    expect(await client.departements()).toEqual([{ code: '01', nom: 'Ain', codeRegion: '84' }]);
    expect(await client.departements()).toHaveLength(1);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.requetes).toBe(1);
    expect(JSON.parse(readFileSync(join(cache, 'departements.json'), 'utf8'))).toHaveLength(1);
  });

  it('respecte une requête par seconde', async () => {
    const horloge = horlogeSimulee();
    const fetch = vi.fn(async () => {
      horloge.avancer(300); // la requête elle-même dure 300 ms
      return reponseJson({ type: 'FeatureCollection', features: [] });
    });
    const client = creerClientApiGeo({ dossierCache: dossierCache(), fetch, ...horloge });

    await client.communes('01');
    await client.communes('02');
    await client.communes('03');

    expect(horloge.attentes).toEqual([700, 700]);
    const url = String((fetch.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/communes?codeDepartement=01&fields=nom,code,codeDepartement,codeRegion,population');
    expect(url).toContain('format=geojson&geometry=contour');
  });

  it('réessaie après une erreur 503 ou une coupure réseau', async () => {
    const horloge = horlogeSimulee();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('occupé', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reponseJson([]));
    const client = creerClientApiGeo({ dossierCache: dossierCache(), fetch, ...horloge });

    expect(await client.departements()).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(horloge.attentes).toContain(5000);
    expect(horloge.attentes).toContain(10000);
  });

  it('abandonne tout de suite sur une erreur 404', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 404 }));
    const client = creerClientApiGeo({ dossierCache: dossierCache(), fetch, ...horlogeSimulee() });
    await expect(client.communes('99')).rejects.toThrow(/HTTP 404/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('hors ligne : lit le cache, échoue s’il manque une réponse', async () => {
    const cache = dossierCache();
    writeFileSync(join(cache, 'communes-972.json'), '{"type":"FeatureCollection","features":[]}');
    const fetch = vi.fn();
    const client = creerClientApiGeo({ dossierCache: cache, horsLigne: true, fetch });

    expect((await client.communes('972')).features).toEqual([]);
    await expect(client.communes('973')).rejects.toThrow(/Hors ligne/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
