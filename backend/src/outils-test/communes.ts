import type { Base } from '../db/connexion.ts';

export interface CommuneDeTest {
  insee: string;
  nom: string;
  departement?: string;
  zone?: string;
  population?: number;
  /** V0 (3 000 par défaut). */
  valeur?: number;
  /** Carré [ouest, sud, côté] en degrés. */
  carre?: [number, number, number];
}

const CARRE_PAR_DEFAUT: [number, number, number] = [4.3, 45.4, 0.1];

const anneau = (ouest: number, sud: number, cote: number, precis: boolean) => [
  [ouest, sud],
  [ouest + cote, sud],
  ...(precis ? [[ouest + cote, sud + cote / 2]] : []), // un point de plus dans le contour `high`
  [ouest + cote, sud + cote],
  [ouest, sud + cote],
  [ouest, sud],
];

/** Insère des communes carrées (territories, contours, index spatial) sans passer par l'import. */
export function insererCommunes(db: Base, communes: CommuneDeTest[]): void {
  const territoire = db.prepare<Record<string, unknown>, number>(`
    INSERT INTO territories (insee_code, name, department_code, region_type, zone_code, population,
      center_lat, center_lng, base_value, building_slots)
    VALUES (@insee, @nom, @departement, @typeRegion, @zone, @population, @lat, @lng, @valeur, 3)
    RETURNING id`);
  const contours = db.prepare('INSERT INTO territory_geometries VALUES (?, ?, ?)');
  const boite = db.prepare('INSERT INTO territories_rtree VALUES (?, ?, ?, ?, ?)');

  db.transaction(() => {
    for (const {
      insee,
      nom,
      departement = '42',
      zone = 'MET',
      population = 100,
      valeur = 3000,
      carre = CARRE_PAR_DEFAUT,
    } of communes) {
      const [ouest, sud, cote] = carre;
      const id = territoire.pluck().get({
        insee,
        nom,
        departement,
        zone,
        population,
        valeur,
        typeRegion: departement.length === 3 ? 'outre_mer' : 'metropole',
        lat: sud + cote / 2,
        lng: ouest + cote / 2,
      });
      contours.run(
        id,
        JSON.stringify({ type: 'Polygon', coordinates: [anneau(ouest, sud, cote, false)] }),
        JSON.stringify({ type: 'Polygon', coordinates: [anneau(ouest, sud, cote, true)] }),
      );
      boite.run(id, ouest, ouest + cote, sud, sud + cote);
    }
  }).immediate();
}
