import { useMoi } from './api/compte.ts';
import { Alertes, BoutonProfil, Compte } from './compte/Compte.tsx';
import { BarreEtat } from './hud/BarreEtat.tsx';
import { Dock } from './hud/Dock.tsx';
import { Legende } from './hud/Legende.tsx';
import { Toasts } from './hud/Toasts.tsx';
import { Tutoriel } from './hud/Tutoriel.tsx';
import { CarteFrance } from './map/CarteFrance.tsx';
import { FicheCommune } from './panels/FicheCommune.tsx';
import { Recherche } from './panels/Recherche.tsx';
import { BoutonZones } from './panels/SelecteurZones.tsx';

/**
 * Écran principal : la carte en plein écran, les panneaux flottent par-dessus. Sur grand écran : la
 * recherche en haut à gauche, les ressources et la fiche à droite, la barre d'onglets en bas au milieu.
 * Sur téléphone, les blocs `contents` s'effacent : tout tient dans une seule colonne, donc rien ne se
 * chevauche, et la fiche, les fenêtres et le tutoriel arrivent en bas, sous le pouce.
 */
export function App() {
  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <main className="absolute inset-0" data-tuto="map">
        <h1 className="sr-only">Kadastr : carte des communes</h1>
        <CarteFrance />
      </main>

      <div className="group pointer-events-none absolute inset-0 z-[1000] flex flex-col gap-2 p-3 pb-0 md:block md:p-0">
        <div className="panneau pointer-events-auto relative flex h-[50px] shrink-0 items-center gap-2.5 rounded-[26px] pr-2 pl-3.5 has-[input:focus]:ring-2 has-[input:focus]:ring-surligneur/60 md:absolute md:top-4 md:left-4 md:z-10 md:h-[52px] md:w-[400px] md:pl-4">
          {/* Même hexagone que favicon.svg : la France, en jaune. */}
          <svg viewBox="0 0 32 32" className="size-[22px] shrink-0" aria-hidden="true">
            <path d="M16 4 27 10 26 22 16 28 6 22 5 10Z" fill="#ffd23f" />
          </svg>
          <Recherche />
          <BoutonZones />
          <ProfilTelephone />
        </div>

        <div className="contents md:pointer-events-none md:absolute md:top-4 md:right-4 md:bottom-28 md:flex md:w-[376px] md:flex-col md:items-end md:gap-4">
          <Compte />
          <Alertes />
          {/* Téléphone : pousse la fiche et la suite en bas de l'écran. */}
          <div className="flex-1 md:hidden" />
          <FicheCommune />
        </div>

        <div className="contents md:absolute md:top-[84px] md:left-4 md:flex md:w-[400px] md:flex-col md:items-start md:gap-2">
          {/* Fiche ou fenêtre ouverte sur téléphone : la barre d'état leur laisse la place. */}
          <div className="self-center max-md:group-has-[.fenetre]:hidden max-md:group-has-[.fiche]:hidden md:self-start">
            <BarreEtat />
          </div>
          <Tutoriel />
        </div>

        <div className="repli max-md:hidden md:absolute md:bottom-7 md:left-4">
          <Legende />
        </div>

        <Dock />
      </div>

      <Toasts />
    </div>
  );
}

/** Téléphone : l'avatar se range au bout de la barre de recherche (la ligne des ressources n'a plus de place). */
function ProfilTelephone() {
  const { data: moi } = useMoi();
  return moi ? <BoutonProfil moi={moi} className="md:hidden" /> : null;
}
