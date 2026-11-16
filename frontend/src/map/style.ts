import type { ProprietesCommuneCarte } from '@france-tycoon/shared';
import type { PathOptions } from 'leaflet';

/** Couleurs de la carte, reprises dans index.css. */
export const COULEURS = {
  encre: '#1b2a41',
  surligneur: '#ffd23f',
  masque: '#3a4356',
  joueurParDefaut: '#2563eb',
  bouclier: '#0f766e',
  opa: '#c2410c',
  opaFond: '#f97316',
} as const;

export interface Mise {
  survolee?: boolean;
  selectionnee?: boolean;
}

/** Style d'une commune selon son état (libre, rival, bouclier, OPA) et l'interaction en cours. */
export function styleCommune(
  p: ProprietesCommuneCarte,
  { survolee = false, selectionnee = false }: Mise = {},
): PathOptions {
  const couleurJoueur = p.ownerColor ?? COULEURS.joueurParDefaut;
  const base: PathOptions = {
    color: COULEURS.encre,
    weight: 0.8,
    opacity: 0.55,
    fill: true,
    fillColor: COULEURS.encre,
    fillOpacity: 0,
    dashArray: undefined,
  };

  const parEtat: Record<ProprietesCommuneCarte['state'], PathOptions> = {
    free: {},
    mine: { color: couleurJoueur, opacity: 0.9, weight: 1.6, fillColor: couleurJoueur, fillOpacity: 0.45 },
    rival: { color: couleurJoueur, opacity: 0.8, weight: 1, fillColor: couleurJoueur, fillOpacity: 0.3 },
    shield: {
      color: COULEURS.bouclier,
      opacity: 0.9,
      weight: 1.4,
      dashArray: '4 3',
      fillColor: couleurJoueur,
      fillOpacity: 0.3,
    },
    takeover: {
      color: COULEURS.opa,
      opacity: 1,
      weight: 1.6,
      dashArray: '6 4',
      fillColor: COULEURS.opaFond,
      fillOpacity: 0.35,
    },
  };

  const style = { ...base, ...parEtat[p.state] };
  if (survolee) {
    style.fillColor = COULEURS.surligneur;
    style.fillOpacity = Math.max(0.3, style.fillOpacity ?? 0);
    style.opacity = 1;
  }
  if (selectionnee) {
    style.color = COULEURS.encre;
    style.weight = 3;
    style.opacity = 1;
    style.dashArray = undefined;
    style.fillColor = COULEURS.surligneur;
    style.fillOpacity = 0.5;
  }
  return style;
}
