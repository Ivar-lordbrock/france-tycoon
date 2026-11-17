import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CategorieInfra } from '@france-tycoon/shared';
import type { MultiPolygon, Polygon } from 'geojson';
import type { Base } from '../../../backend/src/db/connexion.ts';
import type { Boite } from './geometrie.ts';

export const URL_OVERPASS = 'https://overpass-api.de/api/interpreter';

export interface ElementOsm {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Partout : ce que la BPE ne compte pas (gares, aéroports, ports, monuments, musées et attractions). */
const FILTRES_PARTOUT = [
  '["railway"="station"]["station"!~"^(subway|light_rail|monorail|funicular)$"]',
  '["aeroway"="aerodrome"]["iata"]',
  '["leisure"="marina"]',
  '["landuse"="harbour"]',
  '["ref:mhs"]',
  '["tourism"~"^(museum|theme_park|zoo|aquarium|attraction)$"]',
];

/** En plus dans les collectivités d'outre-mer, que la BPE ne couvre pas. */
const FILTRES_COLLECTIVITES = [
  '["shop"]',
  '["amenity"~"^(bank|post_office|townhall|police|fire_station|fuel|school|kindergarten|college|university|hospital|clinic|doctors|dentist|pharmacy|cinema|theatre|restaurant|fast_food|cafe)$"]',
  '["healthcare"]',
  '["leisure"~"^(sports_centre|stadium|pitch|swimming_pool|fitness_centre)$"]',
  '["tourism"~"^(hotel|guest_house|hostel|motel|camp_site)$"]',
];

/** Requête Overpass pour la boîte d'un département ; `out center` donne un point même pour les surfaces. */
export function requeteOverpass([ouest, sud, est, nord]: Boite, collectivite: boolean): string {
  const filtres = collectivite ? [...FILTRES_PARTOUT, ...FILTRES_COLLECTIVITES] : FILTRES_PARTOUT;
  const boite = `(${sud},${ouest},${nord},${est})`;
  return `[out:json][timeout:300];\n(\n${filtres.map((f) => `  nwr${f}${boite};`).join('\n')}\n);\nout tags center;`;
}

const AMENITY: Record<string, CategorieInfra> = {
  bank: 'service',
  post_office: 'service',
  townhall: 'service',
  police: 'service',
  fire_station: 'service',
  fuel: 'service',
  school: 'education',
  kindergarten: 'education',
  college: 'education',
  university: 'education',
  hospital: 'sante',
  clinic: 'sante',
  doctors: 'sante',
  dentist: 'sante',
  pharmacy: 'sante',
  cinema: 'sport_loisir',
  theatre: 'sport_loisir',
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  cafe: 'restaurant',
};
const LOISIRS = new Set(['sports_centre', 'stadium', 'pitch', 'swimming_pool', 'fitness_centre']);
const HEBERGEMENTS = new Set(['hotel', 'guest_house', 'hostel', 'motel', 'camp_site']);
const MUSEES = new Set(['museum', 'theme_park', 'zoo', 'aquarium', 'attraction']);
const METROS = new Set(['subway', 'light_rail', 'monorail', 'funicular']);

/** Catégories d'un objet OSM (un musée classé compte comme musée et comme monument). */
export function categoriesOsm(tags: Record<string, string> = {}, collectivite: boolean): CategorieInfra[] {
  const categories = new Set<CategorieInfra>();
  if (tags.railway === 'station' && !METROS.has(tags.station ?? '')) categories.add('gare');
  if (tags.aeroway === 'aerodrome' && tags.iata) categories.add('aeroport');
  if (tags.leisure === 'marina' || tags.landuse === 'harbour') categories.add('port');
  if (tags['ref:mhs']) categories.add('monument');
  if (MUSEES.has(tags.tourism ?? '')) categories.add('musee_attraction');
  if (collectivite) {
    if (tags.shop) categories.add('commerce');
    const amenity = AMENITY[tags.amenity ?? ''];
    if (amenity) categories.add(amenity);
    if (tags.healthcare) categories.add('sante');
    if (LOISIRS.has(tags.leisure ?? '')) categories.add('sport_loisir');
    if (HEBERGEMENTS.has(tags.tourism ?? '')) categories.add('hotel');
  }
  return [...categories];
}

type Anneau = number[][];

/** Point dans un polygone ou multipolygone (règle pair-impair : les trous sont respectés). */
export function contient(geometrie: Polygon | MultiPolygon, lng: number, lat: number): boolean {
  const anneaux: Anneau[] = geometrie.type === 'Polygon' ? geometrie.coordinates : geometrie.coordinates.flat();
  let dedans = false;
  for (const anneau of anneaux) {
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi = 0, yi = 0] = anneau[i] ?? [];
      const [xj = 0, yj = 0] = anneau[j] ?? [];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

/** Distance (en degrés, longitude corrigée par la latitude) entre un point et le bord le plus proche. */
export function distanceAuBord(geometrie: Polygon | MultiPolygon, lng: number, lat: number): number {
  const anneaux: Anneau[] = geometrie.type === 'Polygon' ? geometrie.coordinates : geometrie.coordinates.flat();
  const k = Math.cos((lat * Math.PI) / 180);
  let min = Number.POSITIVE_INFINITY;
  for (const anneau of anneaux) {
    for (let i = 1; i < anneau.length; i++) {
      const [ax = 0, ay = 0] = anneau[i - 1] ?? [];
      const [bx = 0, by = 0] = anneau[i] ?? [];
      const [ux, uy, vx, vy] = [(bx - ax) * k, by - ay, (lng - ax) * k, lat - ay];
      const t = Math.max(0, Math.min(1, (ux * vx + uy * vy) / (ux * ux + uy * uy || 1)));
      min = Math.min(min, Math.hypot(vx - t * ux, vy - t * uy));
    }
  }
  return min;
}

/** Au-delà de ≈ 1 km d'une commune, un point est hors de France (Genève, Monaco…) ou en pleine mer. */
const TOLERANCE_BORD = 0.01;

/**
 * Trouve la commune d'un point (index spatial puis contour) et la renvoie si elle est dans `departement`.
 * Un point juste hors des contours simplifiés (port, côte) va à la commune la plus proche, à moins de 1 km.
 * Le résultat ne dépend pas du département demandé : un point en bordure n'est compté qu'une fois.
 */
export function creerLocalisateur(db: Base) {
  const candidats = db.prepare<{ lng: number; lat: number }, { id: number; insee: string; departement: string }>(`
    SELECT t.id, t.insee_code AS insee, t.department_code AS departement
    FROM territories_rtree AS r JOIN territories AS t ON t.id = r.id
    WHERE r.min_lng <= @lng + 0.02 AND r.max_lng >= @lng - 0.02 AND r.min_lat <= @lat + 0.01 AND r.max_lat >= @lat - 0.01`);
  const contour = db
    .prepare<[number], string>('SELECT geojson_high FROM territory_geometries WHERE territory_id = ?')
    .pluck();
  const contours = new Map<number, Polygon | MultiPolygon>();
  const geometrie = (id: number) => {
    let g = contours.get(id);
    if (!g) {
      const texte = contour.get(id);
      if (!texte) return null;
      g = JSON.parse(texte) as Polygon | MultiPolygon;
      contours.set(id, g);
    }
    return g;
  };

  return (lng: number, lat: number, departement: string): string | null => {
    const liste = candidats.all({ lng, lat }).flatMap((c) => {
      const g = geometrie(c.id);
      return g ? [{ ...c, g }] : [];
    });
    let trouvee = liste.find((c) => contient(c.g, lng, lat));
    if (!trouvee) {
      let min = TOLERANCE_BORD;
      for (const c of liste) {
        const d = distanceAuBord(c.g, lng, lat);
        if (d < min) [min, trouvee] = [d, c];
      }
    }
    return trouvee?.departement === departement ? trouvee.insee : null;
  };
}

export interface OptionsOverpass {
  /** Dossier du cache des réponses brutes (`data/raw/osm`). */
  dossierCache: string;
  horsLigne?: boolean;
  /** Pause entre deux requêtes, pour ne pas surcharger le serveur public. */
  intervalleMs?: number;
  fetch?: typeof fetch;
  attendre?: (ms: number) => Promise<void>;
  journal?: (message: string) => void;
}

const pause = (ms: number) => new Promise<void>((fin) => setTimeout(fin, ms));

/** Client Overpass : une requête à la fois, réponses gardées sur disque (supprimer le fichier pour forcer). */
export function creerClientOverpass(options: OptionsOverpass) {
  const {
    dossierCache,
    horsLigne = false,
    intervalleMs = 5000,
    fetch: telecharger = globalThis.fetch,
    attendre = pause,
    journal = () => {},
  } = options;
  let requetes = 0;

  return {
    async elements(fichier: string, requete: string): Promise<ElementOsm[]> {
      const cache = join(dossierCache, fichier);
      if (existsSync(cache)) return (JSON.parse(readFileSync(cache, 'utf8')) as { elements: ElementOsm[] }).elements;
      if (horsLigne) throw new Error(`Hors ligne : ${cache} absent du cache`);

      for (let essai = 1; ; essai++) {
        if (requetes > 0) await attendre(intervalleMs);
        requetes++;
        let probleme: string;
        try {
          const reponse = await telecharger(URL_OVERPASS, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'france-tycoon-import/0.1' },
            body: new URLSearchParams({ data: requete }),
          });
          const texte = await reponse.text();
          if (reponse.ok) {
            const donnees = JSON.parse(texte) as { elements?: ElementOsm[]; remark?: string };
            if (!donnees.elements || donnees.remark?.includes('error')) {
              throw new Error(`réponse incomplète${donnees.remark ? ` : ${donnees.remark}` : ''}`);
            }
            mkdirSync(dossierCache, { recursive: true });
            writeFileSync(cache, texte);
            return donnees.elements;
          }
          if (reponse.status !== 429 && reponse.status < 500) {
            throw new Error(`Overpass : HTTP ${reponse.status}`, { cause: 'definitif' });
          }
          probleme = `HTTP ${reponse.status}`;
        } catch (erreur) {
          if (erreur instanceof Error && erreur.cause === 'definitif') throw erreur;
          probleme = erreur instanceof Error ? erreur.message : 'erreur';
        }
        if (essai >= 5) throw new Error(`Overpass ${fichier} : ${probleme} (5 essais)`);
        journal(`${probleme} sur ${fichier}, nouvel essai dans ${essai * 30} s`);
        await attendre(essai * 30_000);
      }
    },
    get requetes() {
      return requetes;
    },
  };
}
