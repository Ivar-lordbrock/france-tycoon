import { Compte } from './compte/Compte.tsx';
import { BarreEtat } from './hud/BarreEtat.tsx';
import { Legende } from './hud/Legende.tsx';
import { Toasts } from './hud/Toasts.tsx';
import { Tutoriel } from './hud/Tutoriel.tsx';
import { CarteFrance } from './map/CarteFrance.tsx';
import { FicheCommune } from './panels/FicheCommune.tsx';
import { Recherche } from './panels/Recherche.tsx';
import { SelecteurZones } from './panels/SelecteurZones.tsx';

/**
 * Écran principal : la carte en plein écran, les panneaux flottent par-dessus, aux coins sur grand écran.
 * Sur téléphone, les blocs `contents` s'effacent : tout tient dans une seule colonne, donc rien ne se
 * chevauche, et la fiche comme le tutoriel arrivent en bas, sous le pouce.
 */
export function App() {
  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <main className="absolute inset-0" data-tuto="map">
        <h1 className="sr-only">Kadastr : carte des communes</h1>
        <CarteFrance />
      </main>

      <div className="group pointer-events-none absolute inset-0 z-[1000] flex flex-col gap-2 p-4 pb-7 md:block">
        <div className="contents md:absolute md:top-4 md:left-4 md:flex md:w-80 md:flex-col md:gap-3">
          <header className="panneau pointer-events-auto p-2.5">
            <p className="marque flex items-center gap-1.5 px-0.5 pb-2">
              {/* Même dessin que favicon.svg : l'hexagone de la France, en jaune sur encre. */}
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
                <rect width="32" height="32" rx="7" fill="#1b2a41" />
                <path d="M16 5 26 10.5 25 21.5 16 27 7 21.5 6 10.5Z" fill="#ffd23f" />
              </svg>
              Kadastr
            </p>
            <Recherche />
          </header>
          <div className="max-md:hidden">
            <SelecteurZones />
          </div>
        </div>

        <div className="contents md:absolute md:top-4 md:right-4 md:flex md:max-h-[calc(100dvh-10rem)] md:w-80 md:flex-col md:gap-3">
          <Compte />
          {/* Téléphone : pousse la fiche et la suite en bas de l'écran. */}
          <div className="flex-1 md:hidden" />
          <FicheCommune />
        </div>

        <div className="contents md:absolute md:inset-x-4 md:bottom-7 md:flex md:flex-col md:items-start md:gap-2">
          <Tutoriel />
          {/* Fiche ouverte sur téléphone : la barre d'état lui laisse la place. */}
          <div className="self-start max-md:group-has-[.fiche]:hidden">
            <BarreEtat />
          </div>
          <div className="repli max-md:hidden">
            <Legende />
          </div>
          <div className="md:hidden">
            <SelecteurZones />
          </div>
        </div>
      </div>

      <Toasts />
    </div>
  );
}
