// Fichier généré par scripts/import/communes.ts à partir des contours de l'API Geo.
// Ne pas modifier à la main : relancer `npm run import:communes`.
import type { BoiteZone, ZoneCode } from './zones.ts';

/** Boîte [ouest, sud, est, nord] et zoom conseillé (écran 1280 × 720) de chaque zone. */
export const BOITES_ZONES: Record<ZoneCode, BoiteZone> = {
  MET: { bbox: [-5.142, 41.333, 9.56, 51.09], zoom: 6 },
  GP: { bbox: [-61.81, 15.832, -61.001, 16.515], zoom: 10 },
  MQ: { bbox: [-61.23, 14.388, -60.809, 14.879], zoom: 10 },
  GF: { bbox: [-54.603, 2.111, -51.619, 5.749], zoom: 8 },
  RE: { bbox: [55.216, -21.39, 55.837, -20.871], zoom: 10 },
  YT: { bbox: [45.018, -13.006, 45.3, -12.636], zoom: 11 },
  PM: { bbox: [-56.519, 46.749, -56.119, 47.145], zoom: 10 },
  BL: { bbox: [-62.927, 17.87, -62.789, 17.975], zoom: 13 },
  MF: { bbox: [-63.154, 18.045, -62.97, 18.126], zoom: 13 },
  WF: { bbox: [-178.182, -14.363, -176.162, -13.217], zoom: 9 },
  PF: { bbox: [-154.723, -27.901, -134.452, -7.858], zoom: 5 },
  NC: { bbox: [163.569, -22.882, 168.134, -19.525], zoom: 8 },
};

/** Raccourci « Corse » du sélecteur (zone MET). */
export const BOITE_CORSE: BoiteZone = { bbox: [8.534, 41.333, 9.56, 43.028], zoom: 8 };
