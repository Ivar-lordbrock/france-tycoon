import { describe, expect, it } from 'vitest';
import { baseDeTest } from '../../../backend/src/outils-test/base.ts';
import { estRejet, type TerritoireImporte, versTerritoire } from './communes.ts';
import { communesDisparues, creerEcrivain, lireComptesInfra } from './ecriture.ts';
import { carre, commune } from './fixtures.ts';

function territoire(...args: Parameters<typeof commune>): TerritoireImporte {
  const resultat = versTerritoire(commune(...args));
  if (estRejet(resultat)) throw new Error(resultat.raison);
  return resultat;
}

const saintEtienne = territoire({ population: 173_089 });
const rouvray = territoire(
  { code: '76575', nom: 'Saint-Étienne-du-Rouvray', codeDepartement: '76', codeRegion: '28', population: 28_000 },
  carre(1.07, 49.35, 0.05),
);

describe('écriture des communes en base', () => {
  it('remplit territories, territory_geometries, l’index spatial et la recherche', () => {
    const db = baseDeTest();
    creerEcrivain(db)([saintEtienne, rouvray]);

    expect(db.prepare('SELECT count(*) FROM territories').pluck().get()).toBe(2);
    expect(db.prepare('SELECT count(*) FROM territory_geometries').pluck().get()).toBe(2);
    const ligne = db
      .prepare("SELECT zone_code, base_value, building_slots, area_km2 FROM territories WHERE insee_code = '42218'")
      .get();
    expect(ligne).toEqual({ zone_code: 'MET', base_value: 1_557_400, building_slots: 12, area_km2: null });

    const visibles = db
      .prepare(
        `SELECT t.insee_code FROM territories_rtree r JOIN territories t ON t.id = r.id
         WHERE r.max_lng >= 4.3 AND r.min_lng <= 4.5 AND r.max_lat >= 45.3 AND r.min_lat <= 45.5`,
      )
      .pluck()
      .all();
    expect(visibles).toEqual(['42218']);

    const trouves = db
      .prepare(
        "SELECT t.name FROM territories_fts f JOIN territories t ON t.id = f.rowid WHERE territories_fts MATCH 'saint etienne' ORDER BY t.name",
      )
      .pluck()
      .all();
    expect(trouves).toEqual(['Saint-Étienne', 'Saint-Étienne-du-Rouvray']);
  });

  it('se rejoue sans doublon et sans toucher au propriétaire', () => {
    const db = baseDeTest();
    const ecrire = creerEcrivain(db);
    ecrire([saintEtienne]);
    db.exec(`
      INSERT INTO users (google_id, email, pseudo) VALUES ('g1', 'a@exemple.fr', 'Alice');
      UPDATE territories SET owner_id = 1, acquired_price = 1557400 WHERE insee_code = '42218';
    `);

    ecrire([{ ...saintEtienne, nom: 'Saint-Étienne (nouveau nom)', population: 180_000 }]);

    expect(db.prepare('SELECT count(*) FROM territories').pluck().get()).toBe(1);
    expect(db.prepare('SELECT count(*) FROM territories_rtree').pluck().get()).toBe(1);
    expect(db.prepare('SELECT name, population, owner_id, acquired_price FROM territories').get()).toEqual({
      name: 'Saint-Étienne (nouveau nom)',
      population: 180_000,
      owner_id: 1,
      acquired_price: 1_557_400,
    });
    expect(db.prepare("SELECT count(*) FROM territories_fts WHERE territories_fts MATCH 'nouveau'").pluck().get()).toBe(
      1,
    );
  });

  it('lit les équipements déjà importés par commune', () => {
    const db = baseDeTest();
    creerEcrivain(db)([saintEtienne]);
    db.exec(`INSERT INTO territory_stats (territory_id, category, source, count) VALUES
      (1, 'commerce', 'bpe', 900), (1, 'commerce', 'osm', 700), (1, 'gare', 'osm', 3)`);

    expect(lireComptesInfra(db).get('42218')).toEqual({ commerce: { bpe: 900, osm: 700 }, gare: { osm: 3 } });
  });

  it('signale les communes en base qui ont disparu de l’API Geo', () => {
    const db = baseDeTest();
    creerEcrivain(db)([saintEtienne, rouvray]);
    expect(communesDisparues(db, new Set(['42218']))).toEqual([{ insee: '76575', possedee: false }]);
  });
});
