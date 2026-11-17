import { BALANCE_VERSION, emplacements, scoreInfra, valeurBase } from '@france-tycoon/shared';
import type { Base } from '../../../backend/src/db/connexion.ts';
import type { ComptesParCommune } from './bpe.ts';
import { lireComptesInfra } from './ecriture.ts';

/**
 * Remplace les équipements d'une source dans `territory_stats`, en une transaction.
 * `departement` limite le remplacement à ses communes (OSM, un département à la fois) ;
 * sans lui, toute la source est remplacée (BPE). Renvoie les codes INSEE absents de la base.
 */
export function ecrireEquipements(
  db: Base,
  source: 'bpe' | 'osm',
  comptes: ComptesParCommune,
  departement?: string,
): { communes: number; inconnues: string[] } {
  const idDe = db.prepare<[string], number>('SELECT id FROM territories WHERE insee_code = ?').pluck();
  const vider = departement
    ? db.prepare(
        'DELETE FROM territory_stats WHERE source = @source AND territory_id IN (SELECT id FROM territories WHERE department_code = @departement)',
      )
    : db.prepare('DELETE FROM territory_stats WHERE source = @source');
  const ajouter = db.prepare(`
    INSERT INTO territory_stats (territory_id, category, source, count) VALUES (?, ?, ?, ?)
    ON CONFLICT (territory_id, category, source) DO UPDATE SET count = excluded.count, imported_at = unixepoch()`);

  return db
    .transaction(() => {
      vider.run(departement ? { source, departement } : { source });
      const inconnues: string[] = [];
      let communes = 0;
      for (const [insee, categories] of comptes) {
        const id = idDe.get(insee);
        if (id === undefined) {
          inconnues.push(insee);
          continue;
        }
        communes++;
        for (const [categorie, nombre] of Object.entries(categories)) {
          if (nombre > 0) ajouter.run(id, categorie, source, nombre);
        }
      }
      return { communes, inconnues };
    })
    .immediate();
}

/**
 * Recalcule I, V0 et les emplacements de toutes les communes à partir de `territory_stats`
 * (formules de shared/src/balance.ts). Ne touche ni au propriétaire ni aux bâtiments.
 * Renvoie le nombre de communes dont la valeur a changé.
 */
export function recalculerValeurs(db: Base): number {
  const comptes = lireComptesInfra(db);
  const communes = db
    .prepare<[], { id: number; insee: string; population: number; infra: number; v0: number; slots: number }>(
      `SELECT id, insee_code AS insee, population, infra_score AS infra, base_value AS v0, building_slots AS slots
       FROM territories`,
    )
    .all();
  const modifier = db.prepare(`
    UPDATE territories
    SET infra_score = @infra, base_value = @v0, building_slots = @slots, balance_version = @version, data_updated_at = unixepoch()
    WHERE id = @id`);

  return db
    .transaction(() => {
      let changees = 0;
      for (const c of communes) {
        const infra = scoreInfra(comptes.get(c.insee) ?? {});
        const v0 = valeurBase(c.population, infra);
        const slots = emplacements(c.population);
        if (infra === c.infra && v0 === c.v0 && slots === c.slots) continue;
        modifier.run({ id: c.id, infra, v0, slots, version: BALANCE_VERSION });
        changees++;
      }
      return changees;
    })
    .immediate();
}
