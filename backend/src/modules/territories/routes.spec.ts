import { ficheCommuneSchema, revenuSol } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import type { Base } from '../../db/connexion.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

function baseAvecCommunes(): Base {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '75056', nom: 'Paris', departement: '75', population: 2_103_778, valeur: 34_886_300 },
    { insee: '97209', nom: 'Fort-de-France', departement: '972', zone: 'MQ', population: 76_000, valeur: 280_000 },
    { insee: '98735', nom: 'Papeete', departement: '987', zone: 'PF', population: 26_654, valeur: 777_400 },
  ]);
  const id = (insee: string) =>
    db.prepare('SELECT id FROM territories WHERE insee_code = ?').pluck().get(insee) as number;
  const stat = db.prepare('INSERT INTO territory_stats (territory_id, category, source, count) VALUES (?, ?, ?, ?)');
  stat.run(id('01001'), 'commerce', 'bpe', 3);
  stat.run(id('01001'), 'commerce', 'osm', 9); // BPE prioritaire : l'OSM est ignoré
  stat.run(id('01001'), 'sante', 'bpe', 2);
  stat.run(id('98735'), 'commerce', 'osm', 120); // pas de BPE dans les COM : OSM
  stat.run(id('98735'), 'port', 'osm', 1);
  return db;
}

const fiche = (app: ReturnType<typeof appDeTest>, insee: string, cookie?: string) =>
  app.inject({ method: 'GET', url: `/api/v1/territories/${insee}`, headers: cookie ? { cookie } : {} });

describe('GET /api/v1/territories/:insee', () => {
  it('fiche d’une commune libre de Métropole : population, équipements, prix, revenu', async () => {
    const reponse = await fiche(appDeTest(baseAvecCommunes()), '01001');

    expect(reponse.statusCode).toBe(200);
    const corps = ficheCommuneSchema.parse(reponse.json());
    expect(corps).toMatchObject({
      insee: '01001',
      name: 'L’Abergement-Clémenciat',
      zone: 'MET',
      regionType: 'metropole',
      population: 859,
      baseValue: 21_800,
      totalValue: 21_800,
      incomePerHour: 218,
      buildingSlots: { total: 3, used: 0 },
      state: 'free',
      owner: null,
      isCapital: false,
      shieldUntil: null,
      takeover: null,
      buildings: [],
    });
    expect(corps.equipments).toEqual([
      { category: 'commerce', count: 3, source: 'bpe' },
      { category: 'sante', count: 2, source: 'bpe' },
    ]);
    // Visiteur : le prix est affiché, l'achat demande une connexion.
    expect(corps.actions).toEqual({
      canBuy: false,
      buyPrice: 21_800,
      buyReasons: ['UNAUTHENTICATED'],
      canTakeover: false,
      takeoverReasons: [],
    });
  });

  it('fiche d’une commune d’Outre-mer (COM) : équipements OpenStreetMap', async () => {
    const corps = ficheCommuneSchema.parse((await fiche(appDeTest(baseAvecCommunes()), '98735')).json());

    expect(corps).toMatchObject({ zone: 'PF', regionType: 'outre_mer', baseValue: 777_400, incomePerHour: 7_774 });
    expect(corps.equipments).toEqual([
      { category: 'commerce', count: 120, source: 'osm' },
      { category: 'port', count: 1, source: 'osm' },
    ]);
  });

  it('joueur connecté : peut acheter si la commune est libre et qu’il a le cash', async () => {
    const app = appDeTest(baseAvecCommunes());
    const { cookie } = await connecter(app, 'Alice');

    const village = ficheCommuneSchema.parse((await fiche(app, '01001', cookie)).json());
    const paris = ficheCommuneSchema.parse((await fiche(app, '75056', cookie)).json());

    expect(village.actions).toMatchObject({ canBuy: true, buyPrice: 21_800, buyReasons: [] });
    expect(paris.actions).toMatchObject({ canBuy: false, buyPrice: 34_886_300, buyReasons: ['INSUFFICIENT_FUNDS'] });
  });

  it('limite de territoires atteinte : TERRITORY_LIMIT_REACHED', async () => {
    const db = baseAvecCommunes();
    const app = appDeTest(db);
    insererCommunes(db, [{ insee: '42218', nom: 'Saint-Étienne', population: 173_000, valeur: 900_000 }]);
    const { cookie, id } = await connecter(app, 'Alice');
    // 4 territoires au départ (TERRITOIRES_DEPART) : la limite est atteinte au 4e.
    db.prepare("UPDATE territories SET owner_id = ? WHERE insee_code IN ('75056', '97209', '98735', '42218')").run(id);

    const corps = ficheCommuneSchema.parse((await fiche(app, '01001', cookie)).json());

    expect(corps.actions.buyReasons).toEqual(['TERRITORY_LIMIT_REACHED']);
  });

  it('commune d’un rival : propriétaire affiché, achat impossible, OPA pas encore ouvertes', async () => {
    const db = baseAvecCommunes();
    const app = appDeTest(db);
    const bob = await connecter(app, 'Bob');
    const alice = await connecter(app, 'Alice');
    db.prepare("UPDATE users SET marker_color = '#e11d48' WHERE id = ?").run(bob.id);
    db.prepare("UPDATE territories SET owner_id = ?, shield_until = unixepoch() + 3600 WHERE insee_code = '97209'").run(
      bob.id,
    );

    const vueAlice = ficheCommuneSchema.parse((await fiche(app, '97209', alice.cookie)).json());
    const vueBob = ficheCommuneSchema.parse((await fiche(app, '97209', bob.cookie)).json());

    expect(vueAlice).toMatchObject({
      state: 'shield',
      owner: { pseudo: 'Bob', markerColor: '#e11d48', isMe: false },
      actions: {
        canBuy: false,
        buyPrice: null,
        buyReasons: ['TERRITORY_NOT_FREE'],
        canTakeover: false,
        takeoverReasons: ['FEATURE_DISABLED'],
      },
    });
    expect(vueAlice.shieldUntil).toBeGreaterThan(Date.now() / 1000);
    expect(vueBob).toMatchObject({ state: 'mine', owner: { isMe: true }, actions: { takeoverReasons: [] } });
  });

  it('valeur totale = V0 + bâtiments + fortifications', async () => {
    const db = baseAvecCommunes();
    const app = appDeTest(db);
    const { id } = await connecter(app, 'Alice');
    db.prepare("UPDATE territories SET owner_id = ?, fortification_value = 1000 WHERE insee_code = '01001'").run(id);
    db.exec(`
      INSERT INTO buildings (territory_id, building_type_id, level, invested_cash)
      SELECT t.id, bt.id, 1, 4430 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01001' AND bt.code = 'residence'`);

    const corps = ficheCommuneSchema.parse((await fiche(app, '01001')).json());

    expect(corps.totalValue).toBe(21_800 + 4_430 + 1_000);
    expect(corps.buildingSlots.used).toBe(1);
    expect(corps.buildings).toMatchObject([{ typeCode: 'residence', level: 1, targetLevel: null }]);
    expect(corps.incomePerHour).toBe(revenuSol(21_800));
  });

  it('code INSEE inconnu : 404 TERRITORY_NOT_FOUND ; code mal formé : 400', async () => {
    const app = appDeTest(baseAvecCommunes());

    const inconnu = await fiche(app, '98401'); // TAAF : jamais importées
    const malForme = await fiche(app, 'paris');

    expect(inconnu.statusCode).toBe(404);
    expect(inconnu.json().error.code).toBe('TERRITORY_NOT_FOUND');
    expect(malForme.statusCode).toBe(400);
  });

  it('accepte les codes corses en minuscules (2a004 → 2A004)', async () => {
    const db = baseDeTest();
    insererCommunes(db, [{ insee: '2A004', nom: 'Ajaccio', departement: '2A' }]);

    const reponse = await fiche(appDeTest(db), '2a004');

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().insee).toBe('2A004');
  });
});
