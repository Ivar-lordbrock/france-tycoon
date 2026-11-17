import {
  type Chantier,
  type MesTerritoires,
  type MonTerritoire,
  valeurTerritoire,
  type ZoneCode,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerLecteurRevenus, revenuDuTerritoire } from '../income/revenus.ts';

interface LigneTerritoire {
  id: number;
  insee: string;
  name: string;
  zone: ZoneCode;
  baseValue: number;
  fortification: number;
  isCapital: number;
  shieldUntil: number | null;
  slots: number;
  invested: number;
  used: number;
}

/** GET /me/territories : mes communes (capitale d'abord, puis dans l'ordre d'achat) et leurs chantiers. */
export function creerLecteurMesTerritoires(db: Base) {
  const territoires = db.prepare<[number], LigneTerritoire>(`
    SELECT t.id, t.insee_code AS insee, t.name, t.zone_code AS zone, t.base_value AS baseValue,
      t.fortification_value AS fortification, t.is_capital AS isCapital, t.shield_until AS shieldUntil,
      t.building_slots AS slots,
      coalesce((SELECT sum(b.invested_cash) FROM buildings AS b WHERE b.territory_id = t.id), 0) AS invested,
      coalesce((
        SELECT sum(bt.slot_size) FROM buildings AS b JOIN building_types AS bt ON bt.id = b.building_type_id
        WHERE b.territory_id = t.id
      ), 0) AS used
    FROM territories AS t
    WHERE t.owner_id = ?
    ORDER BY t.is_capital DESC, t.acquired_at, t.id`);
  const chantiers = db.prepare<[number], Chantier>(`
    SELECT b.id AS buildingId, t.insee_code AS territoryInsee, t.name AS territoryName,
      bt.code AS typeCode, bt.name, b.target_level AS targetLevel,
      coalesce(b.works_started_at, b.updated_at) AS startedAt, b.works_ends_at AS endsAt, b.works_cost AS cost
    FROM buildings AS b
    JOIN territories AS t ON t.id = b.territory_id
    JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE t.owner_id = ? AND b.target_level IS NOT NULL
    ORDER BY b.works_ends_at, b.id`);
  const limite = db.prepare<[number], number>('SELECT max_territories FROM users WHERE id = ?').pluck();
  const lireRevenus = creerLecteurRevenus(db);

  return function lireMesTerritoires(moi: number, maintenant: number): MesTerritoires {
    const parCommune = Map.groupBy(chantiers.all(moi), (c) => c.territoryInsee);
    const revenus = lireRevenus(moi);
    const territories = territoires.all(moi).map(
      (t): MonTerritoire => ({
        insee: t.insee,
        name: t.name,
        zone: t.zone,
        baseValue: t.baseValue,
        totalValue: valeurTerritoire(t.baseValue, t.invested, t.fortification),
        incomePerHour: revenuDuTerritoire(t.baseValue, revenus.get(t.id)?.batiments ?? [], maintenant),
        isCapital: t.isCapital === 1,
        shieldUntil: t.shieldUntil !== null && t.shieldUntil > maintenant ? t.shieldUntil : null,
        buildingSlots: { total: t.slots, used: t.used },
        works: parCommune.get(t.insee) ?? [],
      }),
    );
    return { territories, max: limite.get(moi) ?? 0 };
  };
}
