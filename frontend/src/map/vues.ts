import { type BoiteCarte, VUE_CORSE, ZONES, type ZoneCode } from '@france-tycoon/shared';

/** Entrées du sélecteur : les 12 zones, plus un raccourci « Corse » qui reste dans la zone Métropole. */
export type CleVue = ZoneCode | 'CORSE';

export interface Vue {
  cle: CleVue;
  nom: string;
  /** Zone dont on applique les limites (`maxBounds`) une fois arrivé. */
  zone: ZoneCode;
  bbox: BoiteCarte;
  zoom: number;
}

const versVue = ({ code, nom, bbox, zoom }: (typeof ZONES)[number]): Vue => ({
  cle: code,
  nom,
  zone: code,
  bbox,
  zoom,
});

const metropole = ZONES.find((z) => z.code === 'MET');
if (!metropole) throw new Error('Zone Métropole absente de shared/src/zones.ts');

export const VUE_METROPOLE = versVue(metropole);

export const VUES_METROPOLE: Vue[] = [
  VUE_METROPOLE,
  { cle: 'CORSE', nom: 'Corse', zone: 'MET', bbox: VUE_CORSE.bbox, zoom: VUE_CORSE.zoom },
];

export const VUES_OUTRE_MER: Vue[] = ZONES.filter((z) => z.code !== 'MET').map(versVue);

export function vueDeZone(zone: ZoneCode): Vue {
  return [...VUES_METROPOLE, ...VUES_OUTRE_MER].find((v) => v.cle === zone) ?? VUE_METROPOLE;
}
