import type { ProprietesCommuneCarte } from '@france-tycoon/shared';
import type { PathOptions } from 'leaflet';

/** Couleurs de la carte (thème sombre), reprises dans index.css. */
export const COULEURS = {
  encre: '#e8eaed',
  surligneur: '#ffd23f',
  masque: '#000000',
  joueurParDefaut: '#2563eb',
  bouclier: '#6fd6c4',
  opa: '#fdae6b',
  opaFond: '#f97316',
} as const;

/**
 * Couleur de joueur éclaircie (35 % de blanc) : les 8 couleurs enregistrées sont faites pour un fond
 * clair, trop sombres sur la carte en sombre. La couleur enregistrée ne change pas.
 * Pas de color-mix() : Leaflet écrit la couleur dans un attribut SVG.
 */
export function clair(couleur: string): string {
  const canaux = couleur.slice(1).match(/../g) ?? [];
  return `#${canaux
    .map((h) => {
      const v = Number.parseInt(h, 16);
      return Math.round(v + (255 - v) * 0.35)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

export interface Mise {
  survolee?: boolean;
  selectionnee?: boolean;
}

/** Style d'une commune selon son état (libre, rival, bouclier, OPA) et l'interaction en cours. */
export function styleCommune(
  p: ProprietesCommuneCarte,
  { survolee = false, selectionnee = false }: Mise = {},
): PathOptions {
  const couleurJoueur = clair(p.ownerColor ?? COULEURS.joueurParDefaut);
  const base: PathOptions = {
    color: COULEURS.encre,
    weight: 0.8,
    opacity: 0.3,
    fill: true,
    fillColor: COULEURS.encre,
    fillOpacity: 0,
    dashArray: undefined,
  };

  const parEtat: Record<ProprietesCommuneCarte['state'], PathOptions> = {
    free: {},
    // Contour épais : on reconnaît ses communes même quand un rival a une couleur proche.
    mine: { color: couleurJoueur, opacity: 1, weight: 3, fillColor: couleurJoueur, fillOpacity: 0.5 },
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
  // Survol et choix gardent le fond de l'état : on voit toujours à qui est la commune.
  if (survolee) {
    style.fillOpacity = (style.fillOpacity ?? 0) + 0.15;
    style.opacity = 1;
  }
  if (selectionnee) {
    style.color = COULEURS.surligneur;
    style.weight = 3;
    style.opacity = 1;
    style.dashArray = undefined;
    style.fillOpacity = Math.max(0.15, style.fillOpacity ?? 0);
  }
  return style;
}

/** Bulle au survol : le nom et à qui est la commune (sur la carte, « bouclier » ne vise que les rivaux). */
export function bulleCommune({ name, state, ownerPseudo }: ProprietesCommuneCarte): string {
  const etat = {
    free: 'libre',
    mine: 'à toi',
    rival: `à ${ownerPseudo}`,
    shield: `à ${ownerPseudo}, sous bouclier`,
    takeover: 'OPA en cours',
  }[state];
  return `${name} · ${etat}`;
}
