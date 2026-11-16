import {
  erreurApiSchema,
  MAX_COMMUNES_PAR_REQUETE,
  rechercheReponseSchema,
  territoiresReponseSchema,
  zonesReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest, baseDeTest } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

function baseAvecCommunes() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '42218', nom: 'Saint-Étienne', population: 173_089, carre: [4.3, 45.4, 0.1] },
    { insee: '42207', nom: 'Saint-Chamond', population: 35_000, carre: [4.5, 45.45, 0.1] },
    {
      insee: '76575',
      nom: 'Saint-Étienne-du-Rouvray',
      departement: '76',
      population: 28_000,
      carre: [1.07, 49.35, 0.05],
    },
    { insee: '01366', nom: 'Saint-Étienne-du-Bois', departement: '01', population: 2_600, carre: [5.29, 46.28, 0.05] },
    { insee: '80829', nom: 'Y', departement: '80', population: 90, carre: [2.99, 49.8, 0.02] },
    { insee: '91691', nom: 'Yerres', departement: '91', population: 29_000, carre: [2.48, 48.7, 0.03] },
    {
      insee: '97209',
      nom: 'Fort-de-France',
      departement: '972',
      zone: 'MQ',
      population: 76_000,
      carre: [-61.1, 14.6, 0.1],
    },
  ]);
  return db;
}

const urlCommunes = (bbox: string, zoom: number) => `/api/v1/map/territories?bbox=${bbox}&zoom=${zoom}`;

describe('GET /api/v1/map/zones', () => {
  it('renvoie les 12 zones avec leur boîte et leur zoom, en cache un jour', async () => {
    const reponse = await appDeTest().inject({ method: 'GET', url: '/api/v1/map/zones' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['cache-control']).toBe('public, max-age=86400');
    const { zones } = zonesReponseSchema.parse(reponse.json());
    expect(zones.map((z) => z.code)).toEqual(['MET', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'WF', 'PF', 'NC']);
    expect(zones.find((z) => z.code === 'MQ')?.name).toBe('Martinique');
  });
});

describe('GET /api/v1/map/territories', () => {
  it('renvoie les communes visibles en GeoJSON, contour bas aux zooms 9–10', async () => {
    const app = appDeTest(baseAvecCommunes());

    const reponse = await app.inject({ method: 'GET', url: urlCommunes('4.2,45.3,4.45,45.6', 10) });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('application/json; charset=utf-8');
    const corps = territoiresReponseSchema.parse(reponse.json());
    expect(corps.truncated).toBe(false);
    expect(corps.features).toHaveLength(1);
    expect(corps.features[0]).toMatchObject({
      id: '42218',
      properties: { insee: '42218', name: 'Saint-Étienne', state: 'free', ownerColor: null, ownerPseudo: null },
      geometry: { type: 'Polygon' },
    });
    expect(corps.features[0]?.geometry.coordinates[0]).toHaveLength(5);
  });

  it('passe aux contours précis à partir du zoom 11', async () => {
    const app = appDeTest(baseAvecCommunes());

    const reponse = await app.inject({ method: 'GET', url: urlCommunes('4.2,45.3,4.45,45.6', 11) });

    expect(territoiresReponseSchema.parse(reponse.json()).features[0]?.geometry.coordinates[0]).toHaveLength(6);
  });

  it('indique le propriétaire, le bouclier et les OPA en cours', async () => {
    const db = baseAvecCommunes();
    db.exec(`
      INSERT INTO users (google_id, email, pseudo, marker_color) VALUES ('g1', 'a@exemple.fr', 'Alice', '#dc2626');
      INSERT INTO users (google_id, email, pseudo) VALUES ('g2', 'b@exemple.fr', 'Bruno');
      UPDATE territories SET owner_id = 1 WHERE insee_code = '42218';
      UPDATE territories SET owner_id = 1, shield_until = unixepoch() + 3600 WHERE insee_code = '42207';
      UPDATE territories SET owner_id = 2 WHERE insee_code = '97209';
      INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost, break_fee, expires_at)
        SELECT id, 1, 2, 3000, 4500, 5000, 300, unixepoch() + 86400 FROM territories WHERE insee_code = '97209';
    `);
    const app = appDeTest(db);

    const reponse = await app.inject({ method: 'GET', url: urlCommunes('4.2,45.3,4.7,45.6', 9) });

    const etats = Object.fromEntries(
      territoiresReponseSchema.parse(reponse.json()).features.map((f) => [f.id, f.properties]),
    );
    expect(etats['42218']).toMatchObject({ state: 'rival', ownerColor: '#dc2626', ownerPseudo: 'Alice' });
    expect(etats['42207']).toMatchObject({ state: 'shield', ownerPseudo: 'Alice' });

    const martinique = await app.inject({ method: 'GET', url: urlCommunes('-61.2,14.5,-60.9,14.8', 12) });
    expect(territoiresReponseSchema.parse(martinique.json()).features[0]?.properties).toMatchObject({
      state: 'takeover',
      ownerColor: '#2563eb',
      ownerPseudo: 'Bruno',
    });
  });

  it('refuse un zoom trop faible et une boîte mal formée', async () => {
    const app = appDeTest(baseAvecCommunes());

    for (const url of [
      urlCommunes('4.2,45.3,4.45,45.6', 8),
      urlCommunes('4.2,45.3,4.45', 10),
      urlCommunes('4.45,45.3,4.2,45.6', 10),
      urlCommunes('a,b,c,d', 10),
      urlCommunes('4.2,45.3,4.45,95', 10),
      '/api/v1/map/territories?zoom=10',
    ]) {
      const reponse = await app.inject({ method: 'GET', url });
      expect(reponse.statusCode, url).toBe(400);
      expect(erreurApiSchema.parse(reponse.json()).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('envoie un ETag et répond 304 si rien n’a changé', async () => {
    const db = baseAvecCommunes();
    const app = appDeTest(db);
    const url = urlCommunes('4.2,45.3,4.45,45.6', 10);

    const premiere = await app.inject({ method: 'GET', url });
    const etag = premiere.headers.etag as string;
    expect(etag).toBeTruthy();
    const encore = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(encore.statusCode).toBe(304);

    db.exec(`INSERT INTO users (google_id, email, pseudo) VALUES ('g1', 'a@exemple.fr', 'Alice');
             UPDATE territories SET owner_id = 1 WHERE insee_code = '42218';`);
    const apresAchat = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(apresAchat.statusCode).toBe(200);
  });

  it(`s’arrête à ${MAX_COMMUNES_PAR_REQUETE} communes, les plus peuplées d’abord`, async () => {
    const db = baseDeTest();
    insererCommunes(
      db,
      Array.from({ length: MAX_COMMUNES_PAR_REQUETE + 5 }, (_, i) => ({
        insee: String(10_000 + i),
        nom: `Commune ${i}`,
        population: i,
        carre: [4 + (i % 100) * 0.01, 45 + Math.floor(i / 100) * 0.01, 0.01] as [number, number, number],
      })),
    );
    const app = appDeTest(db);

    const reponse = await app.inject({ method: 'GET', url: urlCommunes('3.9,44.9,5.1,45.4', 9) });

    const corps = territoiresReponseSchema.parse(reponse.json());
    expect(corps.truncated).toBe(true);
    expect(corps.features).toHaveLength(MAX_COMMUNES_PAR_REQUETE);
    expect(corps.features[0]?.properties.name).toBe(`Commune ${MAX_COMMUNES_PAR_REQUETE + 4}`);
  });
});

describe('GET /api/v1/map/search', () => {
  async function chercher(q: string) {
    const app = appDeTest(baseAvecCommunes());
    const reponse = await app.inject({ method: 'GET', url: '/api/v1/map/search', query: { q } });
    expect(reponse.statusCode).toBe(200);
    return rechercheReponseSchema.parse(reponse.json()).results;
  }

  it('« saint etienne » trouve Saint-Étienne en premier', async () => {
    const resultats = await chercher('saint etienne');
    expect(resultats.map((r) => r.name)).toEqual([
      'Saint-Étienne',
      'Saint-Étienne-du-Rouvray',
      'Saint-Étienne-du-Bois',
    ]);
    expect(resultats[0]).toEqual({
      insee: '42218',
      name: 'Saint-Étienne',
      department: '42',
      zone: 'MET',
      population: 173_089,
      center: { lat: expect.closeTo(45.45, 5), lng: expect.closeTo(4.35, 5) },
      bbox: [4.3, 45.4, 4.4, 45.5],
    });
  });

  it('ignore accents, casse, tirets et abréviations', async () => {
    for (const q of ['SAINT-ÉTIENNE', 'st etienne', 'St-Étienne', '  saint   étienne ']) {
      expect((await chercher(q))[0]?.insee, q).toBe('42218');
    }
  });

  it('complète le dernier mot en cours de frappe', async () => {
    expect((await chercher('saint eti')).map((r) => r.insee)).toEqual(['42218', '76575', '01366']);
    expect((await chercher('fort de fr'))[0]).toMatchObject({ name: 'Fort-de-France', zone: 'MQ' });
  });

  it('met le nom exact devant une commune plus peuplée', async () => {
    expect((await chercher('y')).map((r) => r.name)).toEqual(['Y', 'Yerres']);
  });

  it('cherche aussi par code INSEE', async () => {
    expect((await chercher('97209')).map((r) => r.name)).toEqual(['Fort-de-France']);
    expect(await chercher('99999')).toEqual([]);
  });

  it('ne casse pas sur une saisie bizarre', async () => {
    expect(await chercher('"saint" OR NEAR(')).toEqual([]);
    expect(await chercher('--')).toEqual([]);
  });

  it('refuse une recherche vide', async () => {
    const reponse = await appDeTest().inject({ method: 'GET', url: '/api/v1/map/search?q=%20' });
    expect(reponse.statusCode).toBe(400);
  });
});
