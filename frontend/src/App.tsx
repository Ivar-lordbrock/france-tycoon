import { Compte } from './compte/Compte.tsx';
import { BarreEtat } from './hud/BarreEtat.tsx';
import { Legende } from './hud/Legende.tsx';
import { Toasts } from './hud/Toasts.tsx';
import { CarteFrance } from './map/CarteFrance.tsx';
import { FicheCommune } from './panels/FicheCommune.tsx';
import { Recherche } from './panels/Recherche.tsx';
import { SelecteurZones } from './panels/SelecteurZones.tsx';

/** Écran principal : la carte en plein écran, les panneaux flottent par-dessus. */
export function App() {
  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <main className="absolute inset-0">
        <h1 className="sr-only">France Tycoon : carte des communes</h1>
        <CarteFrance />
      </main>

      <div className="pointer-events-none absolute inset-x-4 top-4 z-[1000] flex flex-col gap-3 md:right-auto md:w-80">
        <header className="panneau pointer-events-auto p-2.5">
          <p className="marque px-0.5 pb-2">France Tycoon</p>
          <Recherche />
        </header>
        <div className="max-md:hidden">
          <SelecteurZones />
        </div>
      </div>

      {/* À droite sur grand écran ; sous la recherche sur téléphone, en s'arrêtant au-dessus de la barre du bas. */}
      <div className="pointer-events-none absolute inset-x-4 top-[6.75rem] z-[1000] flex max-h-[calc(100dvh-15rem)] flex-col gap-3 md:top-4 md:left-auto md:max-h-[calc(100dvh-10rem)] md:w-80">
        <Compte />
        <FicheCommune />
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-7 z-[1000] flex flex-col items-start gap-2">
        <BarreEtat />
        <div className="max-md:hidden">
          <Legende />
        </div>
        <div className="w-full md:hidden">
          <SelecteurZones />
        </div>
      </div>

      <Toasts />
    </div>
  );
}
