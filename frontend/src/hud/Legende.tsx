import { ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';
import { useMoi } from '../api/compte.ts';
import { useCarte } from '../etat/carte.ts';
import { COULEURS, clair } from '../map/style.ts';

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
  {
    libelle: 'Bouclier (pas d’OPA)',
    trait: COULEURS.bouclier,
    fond: clair(COULEURS.joueurParDefaut),
    pointilles: '2 1.5',
  },
];

/** Petite légende en bas à gauche, quand les communes sont visibles. */
export function Legende() {
  const zoom = useCarte((etat) => etat.vue?.zoom ?? 0);
  const { data: moi } = useMoi();
  if (zoom < ZOOM_MIN_COMMUNES) return null;
  const couleur = moi && clair(moi.user.markerColor);
  // Chaque rival a sa couleur : l'exemple en prend une autre que la mienne (éclaircies comme sur la carte).
  const rival = clair(moi?.user.markerColor === '#dc2626' ? '#9333ea' : '#dc2626');
  const entrees: Entree[] = [
    ...(couleur ? [{ libelle: 'À toi', trait: couleur, fond: couleur, epais: true }] : []),
    { libelle: 'Rivaux (leur couleur)', trait: rival, fond: rival },
    ...ENTREES,
  ];
  return (
    <ul
      aria-label="Légende de la carte"
      data-tuto="takeover-help"
      className="panneau pointer-events-auto flex flex-col gap-1.5 rounded-[18px] px-3.5 py-2.5 text-xs text-encre max-md:flex-row max-md:flex-wrap max-md:gap-x-3"
    >
      {entrees.map((e) => (
        <li key={e.libelle} className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
            <rect
              x="1"
              y="1"
              width="12"
              height="12"
              rx="3.5"
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
