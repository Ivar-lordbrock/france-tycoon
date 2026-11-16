import { type BoiteCarte, ZOOM_CONTOURS_PRECIS, ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';

/** Contours `low` (zooms 9–10) ou `high` (≥ 11), comme côté serveur. */
export type Detail = 'low' | 'high';

/**
 * La carte charge les communes par cases fixes (1° en `low`, 0,5° en `high`) : une case déjà vue
 * revient du cache, et chaque requête reste loin de la limite de 3 000 communes.
 */
export const TAILLE_CASE: Record<Detail, number> = { low: 1, high: 0.5 };
/** Garde-fou pour un très grand écran : au-delà, on garde les cases les plus proches du centre. */
export const MAX_CASES = 48;

export interface Case {
  cle: string;
  detail: Detail;
  bbox: BoiteCarte;
  /** Zoom envoyé au serveur : toujours le même par détail, pour partager le cache. */
  zoom: number;
}

export function detailPourZoom(zoom: number): Detail {
  return zoom >= ZOOM_CONTOURS_PRECIS ? 'high' : 'low';
}

const borne = (valeur: number, min: number, max: number) => Math.min(max, Math.max(min, valeur));
const arrondi = (valeur: number) => Math.round(valeur * 1000) / 1000;

/** Cases qui couvrent la vue `[ouest, sud, est, nord]` au zoom donné. */
export function casesPourVue(vue: BoiteCarte, zoom: number): Case[] {
  const detail = detailPourZoom(zoom);
  const taille = TAILLE_CASE[detail];
  const [ouest, sud, est, nord] = [
    borne(vue[0], -180, 180),
    borne(vue[1], -85, 85),
    borne(vue[2], -180, 180),
    borne(vue[3], -85, 85),
  ];
  const premiereColonne = Math.floor(ouest / taille);
  const derniereColonne = Math.ceil(est / taille) - 1;
  const premiereLigne = Math.floor(sud / taille);
  const derniereLigne = Math.ceil(nord / taille) - 1;

  const cases: Case[] = [];
  for (let x = premiereColonne; x <= Math.max(premiereColonne, derniereColonne); x++) {
    for (let y = premiereLigne; y <= Math.max(premiereLigne, derniereLigne); y++) {
      cases.push({
        cle: `${detail}:${x}:${y}`,
        detail,
        bbox: [arrondi(x * taille), arrondi(y * taille), arrondi((x + 1) * taille), arrondi((y + 1) * taille)],
        zoom: detail === 'high' ? ZOOM_CONTOURS_PRECIS : ZOOM_MIN_COMMUNES,
      });
    }
  }
  if (cases.length <= MAX_CASES) return cases;

  const centreX = (ouest + est) / 2;
  const centreY = (sud + nord) / 2;
  const distance = ({ bbox: [o, s, e, n] }: Case) => ((o + e) / 2 - centreX) ** 2 + ((s + n) / 2 - centreY) ** 2;
  return cases.sort((a, b) => distance(a) - distance(b)).slice(0, MAX_CASES);
}
