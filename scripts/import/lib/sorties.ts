import { NOMS_ZONES, ZONE_CODES, type ZoneCode } from '@france-tycoon/shared';
import type { Boite } from './geometrie.ts';

/** Agrandit `a` pour contenir `b`. */
export function unirBoites(a: Boite | undefined, b: Boite): Boite {
  if (!a) return [...b];
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Zoom Leaflet qui fait tenir la boîte dans un écran (même calcul que `map.getBoundsZoom`). */
export function zoomPourBoite([ouest, sud, est, nord]: Boite, largeur = 1280, hauteur = 720): number {
  const fractionX = Math.max((est - ouest) / 360, 1e-9);
  const fractionY = Math.max((mercator(nord) - mercator(sud)) / (2 * Math.PI), 1e-9);
  const zoom = Math.floor(Math.log2(Math.min(largeur / (256 * fractionX), hauteur / (256 * fractionY))));
  return Math.min(13, Math.max(3, zoom));
}

const arrondirBoite = (b: Boite): Boite => [
  Math.floor(b[0] * 1e3) / 1e3,
  Math.floor(b[1] * 1e3) / 1e3,
  Math.ceil(b[2] * 1e3) / 1e3,
  Math.ceil(b[3] * 1e3) / 1e3,
];

/** Tableau écrit comme Biome le formaterait. */
const texteBoite = (b: Boite) => `[${arrondirBoite(b).join(', ')}]`;

/** Contenu de `shared/src/zones.generees.ts` (boîte et zoom conseillé de chaque zone). */
export function fichierZones(boites: Map<ZoneCode, Boite>, corse: Boite): string {
  const lignes = ZONE_CODES.map((code) => {
    const b = boites.get(code);
    if (!b) throw new Error(`Aucune commune importée pour la zone ${code} (${NOMS_ZONES[code]})`);
    return `  ${code}: { bbox: ${texteBoite(b)}, zoom: ${zoomPourBoite(b)} },`;
  });
  return `// Fichier généré par scripts/import/communes.ts à partir des contours de l'API Geo.
// Ne pas modifier à la main : relancer \`npm run import:communes\`.
import type { BoiteZone, ZoneCode } from './zones.ts';

/** Boîte [ouest, sud, est, nord] et zoom conseillé (écran 1280 × 720) de chaque zone. */
export const BOITES_ZONES: Record<ZoneCode, BoiteZone> = {
${lignes.join('\n')}
};

/** Raccourci « Corse » du sélecteur (zone MET). */
export const BOITE_CORSE: BoiteZone = { bbox: ${texteBoite(corse)}, zoom: ${zoomPourBoite(corse)} };
`;
}
