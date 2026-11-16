import {
  type BoiteCarte,
  type EtatTerritoire,
  MAX_COMMUNES_PAR_REQUETE,
  MAX_RESULTATS_RECHERCHE,
  normaliserNom,
  type ResultatRecherche,
  ZOOM_CONTOURS_PRECIS,
  type ZoneCode,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

interface LigneCommune {
  insee: string;
  name: string;
  state: Exclude<EtatTerritoire, 'mine'>;
  ownerColor: string | null;
  ownerPseudo: string | null;
  geometry: string;
}

interface LigneRecherche {
  insee: string;
  name: string;
  department: string;
  zone: ZoneCode;
  population: number;
  lat: number;
  lng: number;
  ouest: number;
  sud: number;
  est: number;
  nord: number;
}

/** Abréviations courantes dans la saisie : « st etienne » cherche « saint etienne ». */
const ABREVIATIONS: Record<string, string> = { st: 'saint', ste: 'sainte', sts: 'saints', stes: 'saintes' };
const CANDIDATS_PAR_REQUETE = 200;

/** Requêtes préparées une fois pour toutes les routes /map. */
export function creerRequetesCarte(db: Base) {
  // `mine` demande une session (Sprint 2) : sans connexion, une commune possédée est `rival`.
  const communesVisibles = (colonne: 'geojson_low' | 'geojson_high') =>
    db.prepare<{ ouest: number; sud: number; est: number; nord: number; limite: number }, LigneCommune>(`
      WITH visibles AS (
        SELECT t.id, t.insee_code, t.name, t.owner_id, t.shield_until, t.population
        FROM territories_rtree AS r
        JOIN territories AS t ON t.id = r.id
        WHERE r.max_lng >= @ouest AND r.min_lng <= @est AND r.max_lat >= @sud AND r.min_lat <= @nord
        ORDER BY t.population DESC
        LIMIT @limite
      )
      SELECT
        v.insee_code AS insee,
        v.name,
        CASE
          WHEN v.owner_id IS NULL THEN 'free'
          WHEN EXISTS (SELECT 1 FROM takeovers AS k WHERE k.territory_id = v.id AND k.status = 'pending') THEN 'takeover'
          WHEN v.shield_until > unixepoch() THEN 'shield'
          ELSE 'rival'
        END AS state,
        u.marker_color AS ownerColor,
        u.pseudo AS ownerPseudo,
        g.${colonne} AS geometry
      FROM visibles AS v
      JOIN territory_geometries AS g ON g.territory_id = v.id
      LEFT JOIN users AS u ON u.id = v.owner_id
      ORDER BY v.population DESC`);
  const contoursBas = communesVisibles('geojson_low');
  const contoursHauts = communesVisibles('geojson_high');

  const colonnesRecherche = `
    t.insee_code AS insee, t.name, t.department_code AS department, t.zone_code AS zone, t.population,
    t.center_lat AS lat, t.center_lng AS lng,
    r.min_lng AS ouest, r.min_lat AS sud, r.max_lng AS est, r.max_lat AS nord`;
  const parTexte = db.prepare<[expression: string, limite: number], LigneRecherche>(`
    SELECT ${colonnesRecherche}
    FROM territories_fts AS f
    JOIN territories AS t ON t.id = f.rowid
    JOIN territories_rtree AS r ON r.id = t.id
    WHERE territories_fts MATCH ?
    ORDER BY t.population DESC
    LIMIT ?`);
  const parCodeInsee = db.prepare<[insee: string], LigneRecherche>(`
    SELECT ${colonnesRecherche}
    FROM territories AS t
    JOIN territories_rtree AS r ON r.id = t.id
    WHERE t.insee_code = ?`);

  return {
    /**
     * GeoJSON des communes dont la boîte touche `bbox`, assemblé en texte : les contours sont déjà
     * stockés en JSON, les relire puis les resérialiser coûterait cher (plusieurs Mo par réponse).
     */
    communesVisibles(bbox: BoiteCarte, zoom: number): { json: string; total: number; tronque: boolean } {
      const [ouest, sud, est, nord] = bbox;
      const requete = zoom >= ZOOM_CONTOURS_PRECIS ? contoursHauts : contoursBas;
      const lignes = requete.all({ ouest, sud, est, nord, limite: MAX_COMMUNES_PAR_REQUETE + 1 });
      const tronque = lignes.length > MAX_COMMUNES_PAR_REQUETE;
      const gardees = tronque ? lignes.slice(0, MAX_COMMUNES_PAR_REQUETE) : lignes;
      const features = gardees.map(({ geometry, ...proprietes }) => {
        const id = JSON.stringify(proprietes.insee);
        return `{"type":"Feature","id":${id},"properties":${JSON.stringify(proprietes)},"geometry":${geometry}}`;
      });
      const json = `{"type":"FeatureCollection","features":[${features.join(',')}],"truncated":${tronque}}`;
      return { json, total: gardees.length, tronque };
    },

    /**
     * Recherche insensible aux accents et à la ponctuation, ou par code INSEE. Classement : nom exact,
     * puis nom qui commence par la saisie, puis population.
     */
    rechercher(saisie: string): ResultatRecherche[] {
      if (/^\d[\dAB]\d{3}$/i.test(saisie.trim())) {
        const ligne = parCodeInsee.get(saisie.trim().toUpperCase());
        return ligne ? [versResultat(ligne)] : [];
      }

      const mots = normaliserNom(saisie).split(' ').filter(Boolean);
      if (mots.length === 0) return [];
      const developpes = mots.map((mot, i) => (i < mots.length - 1 ? (ABREVIATIONS[mot] ?? mot) : mot));
      const exacts = developpes.map((mot) => `"${mot}"`).join(' ');
      // Le dernier mot est peut-être en cours de frappe : on le cherche aussi comme préfixe.
      const prefixe = `${exacts}*`;

      const candidats = new Map<string, LigneRecherche>();
      for (const expression of [exacts, prefixe]) {
        for (const ligne of parTexte.all(expression, CANDIDATS_PAR_REQUETE)) candidats.set(ligne.insee, ligne);
      }

      const cible = developpes.join(' ');
      const rang = (nom: string) => {
        const normalise = normaliserNom(nom);
        if (normalise === cible) return 0;
        return normalise.startsWith(cible) ? 1 : 2;
      };
      return [...candidats.values()]
        .map((ligne) => ({ ligne, rang: rang(ligne.name) }))
        .sort(
          (a, b) =>
            a.rang - b.rang ||
            b.ligne.population - a.ligne.population ||
            a.ligne.name.localeCompare(b.ligne.name, 'fr'),
        )
        .slice(0, MAX_RESULTATS_RECHERCHE)
        .map(({ ligne }) => versResultat(ligne));
    },
  };
}

function versResultat(ligne: LigneRecherche): ResultatRecherche {
  return {
    insee: ligne.insee,
    name: ligne.name,
    department: ligne.department,
    zone: ligne.zone,
    population: ligne.population,
    center: { lat: ligne.lat, lng: ligne.lng },
    // L'index spatial stocke des flottants 32 bits : on arrondit au mètre près.
    bbox: [arrondi(ligne.ouest), arrondi(ligne.sud), arrondi(ligne.est), arrondi(ligne.nord)],
  };
}

const arrondi = (degres: number) => Math.round(degres * 1e5) / 1e5;
