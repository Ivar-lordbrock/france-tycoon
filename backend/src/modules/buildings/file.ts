import type { Chantier } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

/** Les chantiers en cours d'un joueur, du plus proche de la fin au plus lointain. */
export function creerLecteurChantiers(db: Base) {
  const chantiers = db.prepare<[number], Chantier>(`
    SELECT b.id AS buildingId, t.insee_code AS territoryInsee, t.name AS territoryName,
      bt.code AS typeCode, bt.name, b.target_level AS targetLevel,
      coalesce(b.works_started_at, b.updated_at) AS startedAt, b.works_ends_at AS endsAt, b.works_cost AS cost
    FROM buildings AS b
    JOIN territories AS t ON t.id = b.territory_id
    JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE t.owner_id = ? AND b.target_level IS NOT NULL
    ORDER BY b.works_ends_at, b.id`);
  return (moi: number): Chantier[] => chantiers.all(moi);
}
