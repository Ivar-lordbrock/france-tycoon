// Provisoire : remplacé par le premier import complet.
import type { BoiteZone, ZoneCode } from './zones.ts';

export const BOITES_ZONES: Record<ZoneCode, BoiteZone> = {
  MET: { bbox: [-5.2, 41.3, 9.6, 51.1], zoom: 5 },
  GP: { bbox: [-61.9, 15.8, -61, 16.6], zoom: 9 },
  MQ: { bbox: [-61.3, 14.3, -60.8, 14.9], zoom: 10 },
  GF: { bbox: [-54.6, 2.1, -51.6, 5.8], zoom: 7 },
  RE: { bbox: [55.2, -21.4, 55.9, -20.8], zoom: 10 },
  YT: { bbox: [45, -13.1, 45.3, -12.6], zoom: 10 },
  PM: { bbox: [-56.5, 46.7, -56.1, 47.2], zoom: 10 },
  BL: { bbox: [-62.9, 17.8, -62.8, 18], zoom: 12 },
  MF: { bbox: [-63.2, 18, -63, 18.2], zoom: 12 },
  WF: { bbox: [-178.2, -14.4, -176.1, -13.2], zoom: 8 },
  PF: { bbox: [-154.8, -27.7, -134.9, -7.9], zoom: 5 },
  NC: { bbox: [163.5, -22.8, 168.2, -19.5], zoom: 7 },
};

export const BOITE_CORSE: BoiteZone = { bbox: [8.5, 41.3, 9.6, 43.1], zoom: 8 };
