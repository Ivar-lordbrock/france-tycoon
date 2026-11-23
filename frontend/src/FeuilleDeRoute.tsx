import type { CategorieFeuilleDeRoute, FonctionnalitePrevue, StatutFeuilleDeRoute } from '@france-tycoon/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { messageErreur } from './api/client.ts';
import { useFeuilleDeRoute } from './api/feuille-de-route.ts';
import { AVIS } from './compte/LiensInfos.tsx';
import { Icone } from './hud/Icone.tsx';

// Un point de couleur par catégorie ; le jaune (seul accent du jeu) va à l'économie, comme le cash.
const CATEGORIES: Record<CategorieFeuilleDeRoute, { libelle: string; point: string }> = {
  social: { libelle: 'Social & clans', point: 'bg-[#8ab4f8]' },
  gameplay: { libelle: 'Gameplay & monde', point: 'bg-succes' },
  economy: { libelle: 'Économie & monétisation', point: 'bg-surligneur' },
};

const STATUTS: Record<StatutFeuilleDeRoute, { libelle: string; classe: string }> = {
  planned: { libelle: 'Prévu', classe: 'text-ardoise ring-1 ring-ardoise/40 ring-inset' },
  in_progress: { libelle: 'En cours', classe: 'bg-alerte/15 text-alerte' },
  released: { libelle: 'Déployé', classe: 'bg-succes/15 text-succes' },
};

/** Page /roadmap : ce qui arrive dans le jeu, filtrable par catégorie ; un clic déplie les détails. */
export function FeuilleDeRoute() {
  const { data, error, isPending } = useFeuilleDeRoute();
  const [filtre, setFiltre] = useState<CategorieFeuilleDeRoute | null>(null);

  useEffect(() => {
    document.title = 'Kadastr : feuille de route';
  }, []);

  const toutes = data?.features ?? [];
  const visibles = filtre ? toutes.filter((f) => f.category === filtre) : toutes;
  // Pas de filtre qui ne montrerait rien.
  const categories = (Object.keys(CATEGORIES) as CategorieFeuilleDeRoute[]).filter((c) =>
    toutes.some((f) => f.category === c),
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-encre/10 bg-fond/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
          {/* Même hexagone que favicon.svg. */}
          <svg viewBox="0 0 32 32" className="size-[22px] shrink-0" aria-hidden="true">
            <path d="M16 4 27 10 26 22 16 28 6 22 5 10Z" fill="#ffd23f" />
          </svg>
          <span className="font-extrabold [font-stretch:112%]">Kadastr</span>
          <a
            href="/"
            className="ml-auto rounded-full px-3 py-2 text-sm font-semibold text-ardoise hover:bg-brume hover:text-encre pointer-coarse:py-3"
          >
            Retour à la carte
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-16">
        <h1 className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.015em] [font-stretch:112%]">
          Feuille de route
        </h1>
        <p className="mt-2 text-ardoise">
          Ce qui arrive bientôt dans Kadastr. Rien n'est figé, ces idées peuvent encore changer.
          {AVIS && (
            <>
              {' '}
              <a href={AVIS} target="_blank" rel="noopener" className="font-semibold text-encre underline">
                Donne ton avis
              </a>
              .
            </>
          )}
        </p>

        {categories.length > 1 && (
          // Téléphone : une seule ligne qui défile au doigt, comme les puces de Google Maps.
          <fieldset className="-mx-4 mt-5 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <legend className="sr-only">Filtrer par catégorie</legend>
            <Puce actif={filtre === null} onClick={() => setFiltre(null)} nombre={toutes.length}>
              Tout
            </Puce>
            {categories.map((c) => (
              <Puce
                key={c}
                actif={filtre === c}
                onClick={() => setFiltre(c)}
                nombre={toutes.filter((f) => f.category === c).length}
              >
                <span className={`size-2 rounded-full ${CATEGORIES[c].point}`} aria-hidden="true" />
                {CATEGORIES[c].libelle}
              </Puce>
            ))}
          </fieldset>
        )}

        {isPending && <p className="mt-6 text-ardoise">Chargement…</p>}
        {error && (
          <p role="alert" className="mt-6 text-danger">
            {messageErreur(error)}
          </p>
        )}
        <ul className="mt-4 flex flex-col gap-3">
          {visibles.map((f) => (
            <li key={f.code}>
              <Fonctionnalite f={f} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Puce({
  actif,
  onClick,
  nombre,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  nombre: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
        actif ? 'bg-encre text-fond' : 'bg-brume text-encre hover:bg-[#3a3e45]'
      }`}
    >
      {children}
      <span className={actif ? 'text-fond/60' : 'text-ardoise'}>{nombre}</span>
    </button>
  );
}

/** Espace insécable avant « : ; ! ? » : la ponctuation ne part pas seule en début de ligne. */
const insecable = (texte: string) => texte.replace(/ ([:;!?])/g, ' $1');

/** Carte repliable (`<details>` : clavier et lecteurs d'écran gérés par le navigateur). */
function Fonctionnalite({ f }: { f: FonctionnalitePrevue }) {
  const categorie = CATEGORIES[f.category];
  const statut = STATUTS[f.status];
  return (
    <details className="panneau group">
      <summary className="flex cursor-pointer list-none gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brume px-2 py-0.5">
              <span className={`size-2 rounded-full ${categorie.point}`} aria-hidden="true" />
              {categorie.libelle}
            </span>
            <span className={`rounded-full px-2 py-0.5 ${statut.classe}`}>{statut.libelle}</span>
          </div>
          <h2 className="mt-2 text-lg leading-tight font-bold text-balance">{f.title}</h2>
          <p className="mt-1 text-sm text-ardoise">{insecable(f.summary)}</p>
        </div>
        <span className="mt-0.5 shrink-0 self-start text-ardoise transition-transform duration-150 ease-out group-open:rotate-180">
          <Icone nom="chevron" />
        </span>
      </summary>
      <ul className="mx-4 mb-4 list-disc space-y-2 border-t border-encre/10 pt-3 pl-5 text-sm leading-relaxed marker:text-ardoise">
        {f.details.map((d) => (
          <li key={d}>{insecable(d)}</li>
        ))}
      </ul>
    </details>
  );
}
