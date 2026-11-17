import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { baseDeTest } from '../../../backend/src/outils-test/base.ts';
import { estRejet, versTerritoire } from './communes.ts';
import { creerEcrivain } from './ecriture.ts';
import { carre, commune } from './fixtures.ts';
import { categoriesOsm, contient, creerClientOverpass, creerLocalisateur, requeteOverpass } from './osm.ts';

describe('requête et catégories OSM', () => {
  it('requête Overpass : boîte dans l’ordre sud, ouest, nord, est ; commerces seulement en collectivité', () => {
    const metropole = requeteOverpass([4.3, 45.2, 4.6, 45.6], false);
    const polynesie = requeteOverpass([-155, -28, -134, -7], true);

    expect(metropole).toContain('nwr["ref:mhs"](45.2,4.3,45.6,4.6);');
    expect(metropole).not.toContain('["shop"]');
    expect(metropole).toMatch(/out tags center;$/);
    expect(polynesie).toContain('nwr["shop"](-28,-155,-7,-134);');
  });

  it('range les objets : gares sans métro, musée classé = musée et monument, commerces en collectivité', () => {
    expect(categoriesOsm({ railway: 'station', station: 'train' }, false)).toEqual(['gare']);
    expect(categoriesOsm({ railway: 'station', station: 'subway' }, false)).toEqual([]);
    expect(categoriesOsm({ aeroway: 'aerodrome' }, false)).toEqual([]);
    expect(categoriesOsm({ aeroway: 'aerodrome', iata: 'PPT' }, false)).toEqual(['aeroport']);
    expect(categoriesOsm({ tourism: 'museum', 'ref:mhs': 'PA00088801' }, false).sort()).toEqual([
      'monument',
      'musee_attraction',
    ]);
    expect(categoriesOsm({ shop: 'bakery' }, false)).toEqual([]);
    expect(categoriesOsm({ shop: 'bakery' }, true)).toEqual(['commerce']);
    expect(categoriesOsm({ amenity: 'pharmacy' }, true)).toEqual(['sante']);
    expect(categoriesOsm({ tourism: 'guest_house' }, true)).toEqual(['hotel']);
    expect(categoriesOsm(undefined, true)).toEqual([]);
  });

  it('point dans un polygone, trous compris', () => {
    const avecTrou: Polygon = {
      type: 'Polygon',
      coordinates: [...carre(0, 0, 10).coordinates, ...carre(4, 4, 2).coordinates],
    };

    expect(contient(avecTrou, 1, 1)).toBe(true);
    expect(contient(avecTrou, 5, 5)).toBe(false);
    expect(contient(avecTrou, 11, 1)).toBe(false);
  });
});

describe('creerLocalisateur', () => {
  const db = baseDeTest();
  const territoires = [
    commune({ code: '42218', codeDepartement: '42' }, carre(4.35, 45.4, 0.08)),
    commune({ code: '69123', nom: 'Lyon', codeDepartement: '69', codeRegion: '84' }, carre(4.43, 45.4, 0.08)),
  ].map((c) => {
    const t = versTerritoire(c);
    if (estRejet(t)) throw new Error(t.raison);
    return t;
  });
  creerEcrivain(db)(territoires);
  const localiser = creerLocalisateur(db);

  it('trouve la commune du point, seulement si elle est dans le département demandé', () => {
    expect(localiser(4.39, 45.44, '42')).toBe('42218');
    expect(localiser(4.39, 45.44, '69')).toBeNull(); // compté avec le Rhône, pas deux fois
    expect(localiser(4.47, 45.44, '69')).toBe('69123');
  });

  it('un point juste hors du contour (port, côte) va à la commune voisine ; loin, il est ignoré', () => {
    expect(localiser(4.345, 45.44, '42')).toBe('42218'); // ≈ 400 m
    expect(localiser(4.33, 45.44, '42')).toBeNull(); // ≈ 1,6 km : hors de France
    expect(localiser(2, 48, '42')).toBeNull();
  });
});

describe('creerClientOverpass', () => {
  it('réessaie après un 429, garde la réponse en cache et ne la redemande plus', async () => {
    const dossierCache = mkdtempSync(join(tmpdir(), 'osm-'));
    const reponses = [
      new Response('trop de requêtes', { status: 429 }),
      Response.json({ elements: [{ type: 'node', id: 1, lat: 45, lon: 4, tags: { 'ref:mhs': 'PA1' } }] }),
    ];
    const appels: string[] = [];
    const attentes: number[] = [];
    const client = creerClientOverpass({
      dossierCache,
      fetch: async (_url, init) => {
        appels.push(String((init?.body as URLSearchParams | undefined)?.get('data')));
        return reponses.shift() as Response;
      },
      attendre: async (ms) => {
        attentes.push(ms);
      },
    });

    const elements = await client.elements('42.json', 'requete');
    const encore = await client.elements('42.json', 'requete');

    expect(elements).toHaveLength(1);
    expect(encore).toEqual(elements);
    expect(appels).toEqual(['requete', 'requete']);
    expect(attentes).toEqual([30_000, 5000]);
    await expect(
      creerClientOverpass({ dossierCache, horsLigne: true }).elements('987.json', 'requete'),
    ).rejects.toThrow(/Hors ligne/);
  });
});
