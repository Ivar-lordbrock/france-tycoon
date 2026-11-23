import { ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';
import { useCarte } from '../etat/carte.ts';

const nombre = new Intl.NumberFormat('fr-FR');

/** Ce que montre la carte en ce moment, et quoi faire pour voir les communes. */
export function BarreEtat() {
  const zoom = useCarte((etat) => etat.vue?.zoom ?? 0);
  const { communes, enCours, tronque, erreur } = useCarte((etat) => etat.chargement);

  let texte: string;
  if (zoom < ZOOM_MIN_COMMUNES) texte = 'Zoome ou choisis un département pour voir ses communes';
  else if (erreur) texte = 'Communes indisponibles : le serveur ne répond pas. Nouvel essai automatique.';
  else if (enCours && communes === 0) texte = 'Chargement des communes…';
  else if (tronque) texte = `${nombre.format(communes)} communes affichées. Zoome pour les voir toutes.`;
  else texte = `${nombre.format(communes)} commune${communes > 1 ? 's' : ''} à l’écran`;

  return (
    <p
      role="status"
      aria-live="polite"
      className="panneau pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 text-sm text-encre"
    >
      {enCours && zoom >= ZOOM_MIN_COMMUNES && (
        <span
          className="size-2 shrink-0 animate-pulse rounded-full bg-encre motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {texte}
    </p>
  );
}
