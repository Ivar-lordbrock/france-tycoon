import type { CategorieInfra, ComptesInfra } from '@france-tycoon/shared';
import type { Base } from '../../../backend/src/db/connexion.ts';
import type { TerritoireImporte } from './communes.ts';

/**
 * Écrit les communes d'un département en une transaction (`BEGIN IMMEDIATE`).
 * Rejouable : met à jour les données publiques sans toucher au propriétaire, aux bâtiments
 * ni aux fortifications. La recherche plein texte suit grâce aux déclencheurs de 001.
 */
export function creerEcrivain(db: Base) {
  const enregistrer = db
    .prepare<Record<string, unknown>, number>(`
      INSERT INTO territories (
        insee_code, name, department_code, region_code, region_type, zone_code, population, area_km2,
        center_lat, center_lng, infra_score, base_value, building_slots, balance_version, data_updated_at
      ) VALUES (
        @insee, @nom, @departement, @region, @typeRegion, @zone, @population, @surfaceKm2,
        @lat, @lng, @infra, @valeurBase, @emplacements, @balanceVersion, unixepoch()
      )
      ON CONFLICT (insee_code) DO UPDATE SET
        name = excluded.name,
        department_code = excluded.department_code,
        region_code = excluded.region_code,
        region_type = excluded.region_type,
        zone_code = excluded.zone_code,
        population = excluded.population,
        area_km2 = excluded.area_km2,
        center_lat = excluded.center_lat,
        center_lng = excluded.center_lng,
        infra_score = excluded.infra_score,
        base_value = excluded.base_value,
        building_slots = excluded.building_slots,
        balance_version = excluded.balance_version,
        data_updated_at = excluded.data_updated_at
      RETURNING id`)
    .pluck();
  const enregistrerContours = db.prepare(`
    INSERT INTO territory_geometries (territory_id, geojson_low, geojson_high) VALUES (?, ?, ?)
    ON CONFLICT (territory_id) DO UPDATE SET geojson_low = excluded.geojson_low, geojson_high = excluded.geojson_high`);
  const retirerBoite = db.prepare('DELETE FROM territories_rtree WHERE id = ?');
  const ajouterBoite = db.prepare(
    'INSERT INTO territories_rtree (id, min_lng, max_lng, min_lat, max_lat) VALUES (?, ?, ?, ?, ?)',
  );

  const ecrire = db.transaction((territoires: TerritoireImporte[]) => {
    for (const t of territoires) {
      const id = enregistrer.get({
        insee: t.insee,
        nom: t.nom,
        departement: t.departement,
        region: t.region,
        typeRegion: t.typeRegion,
        zone: t.zone,
        population: t.population,
        surfaceKm2: t.surfaceKm2,
        lat: t.centre.lat,
        lng: t.centre.lng,
        infra: t.infra,
        valeurBase: t.valeurBase,
        emplacements: t.emplacements,
        balanceVersion: t.balanceVersion,
      });
      if (id === undefined) throw new Error(`Écriture impossible pour ${t.insee}`);
      enregistrerContours.run(id, t.contourLow, t.contourHigh);
      const [ouest, sud, est, nord] = t.boite;
      retirerBoite.run(id);
      ajouterBoite.run(id, ouest, est, sud, nord);
    }
  });

  return (territoires: TerritoireImporte[]) => ecrire.immediate(territoires);
}

/** Équipements déjà importés (BPE, OSM) par code INSEE : vide au Sprint 1, donc I = 0. */
export function lireComptesInfra(db: Base): Map<string, ComptesInfra> {
  const lignes = db
    .prepare<[], { insee: string; category: CategorieInfra; source: 'bpe' | 'osm'; count: number }>(`
      SELECT t.insee_code AS insee, s.category, s.source, s.count
      FROM territory_stats AS s JOIN territories AS t ON t.id = s.territory_id`)
    .all();
  const parCommune = new Map<string, ComptesInfra>();
  for (const { insee, category, source, count } of lignes) {
    const comptes = parCommune.get(insee) ?? {};
    comptes[category] = { ...comptes[category], [source]: count };
    parCommune.set(insee, comptes);
  }
  return parCommune;
}

/** Communes en base absentes de l'import (fusions de communes au 1er janvier) : à traiter à la main. */
export function communesDisparues(db: Base, importees: ReadonlySet<string>): { insee: string; possedee: boolean }[] {
  return db
    .prepare<[], { insee: string; owner: number | null }>(
      'SELECT insee_code AS insee, owner_id AS owner FROM territories',
    )
    .all()
    .filter((ligne) => !importees.has(ligne.insee))
    .map((ligne) => ({ insee: ligne.insee, possedee: ligne.owner !== null }));
}
