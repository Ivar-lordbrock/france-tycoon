import { ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';
import { useMoi } from '../api/compte.ts';
import { useCarte } from '../etat/carte.ts';
import { COULEURS } from '../map/style.ts';

interface Entree {
  libelle: string;
  trait: string;
  fond: string;
  epais?: boolean;
  pointilles?: string;
}

/** Les états d'une commune sur la carte (mêmes couleurs que `styleCommune`). */
const ENTREES: Entree[] = [
  { libelle: 'Libre', trait: COULEURS.encre, fond: 'none' },
  { libelle: 'OPA en cours', trait: COULEURS.opa, fond: COULEURS.opaFond, pointilles: '3 2' },
  { libelle: 'Bouclier (pas d’OPA)', trait: COULEURS.bouclier, fond: COULEURS.joueurParDefaut, pointilles: '2 1.5' },
];

/** Petite légende sous la barre d'état, quand les communes sont visibles. */
export function Legende() {
  const zoom = useCarte((etat) => etat.vue?.zoom ?? 0);
  const { data: moi } = useMoi();
  if (zoom < ZOOM_MIN_COMMUNES) return null;
  const couleur = moi?.user.markerColor;
  // Chaque rival a sa couleur : l'exemple en prend une autre que la mienne.
  const rival = couleur === '#dc2626' ? '#9333ea' : '#dc2626';
  const entrees: Entree[] = [
    ...(couleur ? [{ libelle: 'À toi', trait: couleur, fond: couleur, epais: true }] : []),
    { libelle: 'Rival (sa couleur)', trait: rival, fond: rival },
    ...ENTREES,
  ];
  return (
    <ul
      aria-label="Légende de la carte"
      data-tuto="takeover-help"
      className="panneau pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-xs text-encre"
    >
      {entrees.map((e) => (
        <li key={e.libelle} className="flex items-center gap-1.5">
          <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
            <rect
              x="1"
              y="1"
              width="12"
              height="12"
              rx="2"
              fill={e.fond}
              fillOpacity="0.35"
              stroke={e.trait}
              strokeWidth={e.epais ? 3 : 1.5}
              strokeDasharray={e.pointilles}
            />
          </svg>
          {e.libelle}
        </li>
      ))}
    </ul>
  );
}
