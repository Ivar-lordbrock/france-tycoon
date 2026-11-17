import { scoreInfra, valeurBase } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { baseDeTest } from '../../../backend/src/outils-test/base.ts';
import { estRejet, versTerritoire } from './communes.ts';
import { creerEcrivain, lireComptesInfra } from './ecriture.ts';
import { ecrireEquipements, recalculerValeurs } from './equipements.ts';
import { carre, commune } from './fixtures.ts';

function baseAvecCommunes() {
  const db = baseDeTest();
  const territoires = [
    commune({ code: '42218', codeDepartement: '42', population: 173_089 }),
    commune({ code: '69123', nom: 'Lyon', codeDepartement: '69', population: 519_127 }, carre(4.8, 45.7, 0.1)),
  ].map((c) => {
    const t = versTerritoire(c);
    if (estRejet(t)) throw new Error(t.raison);
    return t;
  });
  creerEcrivain(db)(territoires);
  return db;
}

const valeur = (db: ReturnType<typeof baseDeTest>, insee: string) =>
  db.prepare('SELECT infra_score AS infra, base_value AS v0 FROM territories WHERE insee_code = ?').get(insee);

describe('équipements et valeurs', () => {
  it('écrit les comptes BPE, signale les codes inconnus, puis recalcule I et V0', () => {
    const db = baseAvecCommunes();

    const resultat = ecrireEquipements(
      db,
      'bpe',
      new Map([
        ['42218', { commerce: 100, sante: 50 }],
        ['99999', { commerce: 1 }],
      ]),
    );
    const changees = recalculerValeurs(db);

    expect(resultat).toEqual({ communes: 1, inconnues: ['99999'] });
    expect(changees).toBe(1);
    expect(valeur(db, '42218')).toEqual({ infra: 200, v0: valeurBase(173_089, 200) });
    expect(valeur(db, '69123')).toEqual({ infra: 0, v0: valeurBase(519_127, 0) });
    expect(recalculerValeurs(db)).toBe(0); // rien de neuf
  });

  it('OSM par département : ne remplace que les communes de ce département, et garde la BPE', () => {
    const db = baseAvecCommunes();
    ecrireEquipements(db, 'bpe', new Map([['42218', { commerce: 10 }]]));
    ecrireEquipements(db, 'osm', new Map([['42218', { gare: 2 }]]), '42');
    ecrireEquipements(db, 'osm', new Map([['69123', { gare: 5, monument: 3 }]]), '69');

    ecrireEquipements(db, 'osm', new Map([['42218', { gare: 1 }]]), '42');
    recalculerValeurs(db);

    const comptes = lireComptesInfra(db);
    expect(comptes.get('42218')).toEqual({ commerce: { bpe: 10 }, gare: { osm: 1 } });
    expect(comptes.get('69123')).toEqual({ gare: { osm: 5 }, monument: { osm: 3 } });
    expect(valeur(db, '42218')).toMatchObject({ infra: scoreInfra({ commerce: { bpe: 10 }, gare: { osm: 1 } }) });
  });

  it('ne touche pas au propriétaire', () => {
    const db = baseAvecCommunes();
    const id = db
      .prepare("INSERT INTO users (google_id, email, pseudo) VALUES ('g', 'a@test.fr', 'Alice') RETURNING id")
      .pluck()
      .get();
    db.prepare("UPDATE territories SET owner_id = ? WHERE insee_code = '42218'").run(id);

    ecrireEquipements(db, 'bpe', new Map([['42218', { commerce: 10 }]]));
    recalculerValeurs(db);

    expect(db.prepare("SELECT owner_id FROM territories WHERE insee_code = '42218'").pluck().get()).toBe(id);
  });
});
