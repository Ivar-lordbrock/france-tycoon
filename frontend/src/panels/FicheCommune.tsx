import type { TerritoiresReponse } from '@france-tycoon/shared';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { MultiPolygon, Polygon } from 'geojson';
import { type KeyboardEvent as ToucheReact, useEffect, useMemo } from 'react';
import { useFiche, useMoi } from '../api/compte.ts';
import { suivre } from '../api/quetes.ts';
import { type OngletFiche, useCarte } from '../etat/carte.ts';
import { BoutonFermer } from '../hud/Dock.tsx';
import { clair } from '../map/style.ts';
import { ActionsFiche } from './ActionsFiche.tsx';
import { ActionsOpa } from './ActionsOpa.tsx';
import { entier, lieu, phraseEquipements, phrasePlaces, proprietaire, raisonAchat, tycoons } from './fiche-texte.ts';
import { OngletBatiments } from './OngletBatiments.tsx';
import { silhouette } from './silhouette.ts';
import { estAMoi } from './territoires-texte.ts';

/** Fiche de la commune choisie (clic sur la carte ou recherche), comme une carte à jouer. Échap la ferme. */
export function FicheCommune() {
  const selection = useCarte((etat) => etat.selection);
  const definirSelection = useCarte((etat) => etat.definirSelection);
  const onglet = useCarte((etat) => etat.onglet);
  const definirOnglet = useCarte((etat) => etat.definirOnglet);
  const { data: fiche, isPending, isError } = useFiche(selection);
  const { data: moi } = useMoi();
  const client = useQueryClient();
  const connecte = Boolean(moi);

  // Fiche ouverte : quête « Repérage ».
  useEffect(() => {
    if (selection && connecte) suivre(client, 'territory_visited', selection);
  }, [selection, connecte, client]);

  useEffect(() => {
    if (!selection) return;
    const fermer = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('input, textarea')) definirSelection(null);
    };
    window.addEventListener('keydown', fermer);
    return () => window.removeEventListener('keydown', fermer);
  }, [selection, definirSelection]);

  if (!selection) return null;

  // Téléphone : une fenêtre du bas ouverte prend la place de la fiche (elle revient à sa fermeture).
  const cadre = 'fiche panneau pointer-events-auto relative w-full rounded-[28px] max-md:group-has-[.fenetre]:hidden';
  const fermer = (
    <BoutonFermer
      libelle="Fermer la fiche"
      onClick={() => definirSelection(null)}
      className="absolute top-3.5 right-3.5"
    />
  );

  if (isPending || isError || !fiche) {
    return (
      <section className={`${cadre} p-5 pr-14`} aria-live="polite">
        <p className="text-sm text-ardoise">
          {isError ? 'Fiche indisponible : le serveur ne répond pas.' : 'Chargement de la fiche…'}
        </p>
        {fermer}
      </section>
    );
  }

  const raisons = fiche.actions.buyReasons
    .map((code) => raisonAchat(code, fiche, moi ?? null))
    .filter((texte): texte is string => texte !== null);
  const couleur = fiche.owner?.markerColor;
  const libre = fiche.state === 'free';
  // Sur mes communes, deux onglets : la commune, et ses bâtiments.
  const aMoi = estAMoi(fiche) && moi != null;

  return (
    <section
      aria-labelledby="fiche-titre"
      data-tuto="territory-panel"
      className={`${cadre} flex min-h-0 flex-col overflow-hidden max-md:max-h-[60dvh]`}
    >
      <header className="flex shrink-0 items-center gap-4 bg-[radial-gradient(120%_140%_at_0%_0%,rgb(255_255_255/0.07),transparent_60%)] py-5 pr-14 pl-5 max-md:gap-3.5 max-md:pb-3 max-md:pl-[18px]">
        <Silhouette insee={fiche.insee} couleur={couleur ? clair(couleur) : null} />
        <div className="min-w-0">
          <p className="mb-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-encre/10 px-2.5 py-0.5">
              {couleur && (
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: clair(couleur) }}
                  aria-hidden="true"
                />
              )}
              {proprietaire(fiche)}
            </span>
            {fiche.isCapital && <span className="rounded-lg bg-surligneur px-2.5 py-0.5 text-fond">Capitale</span>}
          </p>
          <h2
            id="fiche-titre"
            className={`line-clamp-2 leading-[1.05] font-extrabold tracking-[-0.015em] text-balance [font-stretch:112%] ${
              // Les noms composés (« Saint-Maurice-près-Crocq ») ne se coupent qu'aux tirets : plus petits, ils tiennent en deux lignes.
              fiche.name.length > 14 ? 'text-[22px]' : 'text-[28px] max-md:text-[25px]'
            }`}
          >
            {fiche.name}
          </h2>
          <p className="mt-1 text-sm text-ardoise">
            {lieu(fiche)}, {entier(fiche.population)} habitant{fiche.population > 1 ? 's' : ''}
          </p>
        </div>
        {fermer}
      </header>

      {aMoi && <Onglets onglet={onglet} definir={definirOnglet} batiments={`${fiche.buildings.length}`} />}

      {aMoi && onglet === 'batiments' ? (
        <div
          id="fiche-panneau-batiments"
          role="tabpanel"
          aria-labelledby="fiche-onglet-batiments"
          className="overflow-y-auto overscroll-contain px-5 pt-3 pb-5 max-md:px-[18px]"
        >
          <OngletBatiments fiche={fiche} moi={moi} />
        </div>
      ) : (
        <div
          id="fiche-panneau-infos"
          {...(aMoi ? { role: 'tabpanel', 'aria-labelledby': 'fiche-onglet-infos' } : {})}
          className="overflow-y-auto overscroll-contain px-5 pt-1 pb-5 max-md:px-[18px]"
        >
          <dl className="flex flex-wrap items-end gap-x-[18px] gap-y-2 tabular-nums">
            <div className="flex flex-col">
              <dt className="order-last mt-0.5 text-[13px] text-ardoise">{libre ? 'prix d’achat' : 'valeur'}</dt>
              <dd className="text-[34px] leading-[34px] font-extrabold tracking-[-0.02em] max-md:text-[30px]">
                {tycoons(libre ? fiche.baseValue : fiche.totalValue)}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="order-last mt-0.5 text-[13px] text-ardoise">
                {libre ? 'revenu une fois à toi' : 'revenu'}
              </dt>
              <dd className="text-base leading-[34px] font-bold text-succes">+{tycoons(fiche.incomePerHour)}/h</dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-2.5 text-[13px] text-ardoise">
            <Alveoles {...fiche.buildingSlots} />
            <span>{phrasePlaces(fiche.buildingSlots)}</span>
          </div>
          <p className="mt-1.5 text-[13px] text-ardoise">{phraseEquipements(fiche)}</p>

          <ActionsFiche key={fiche.insee} fiche={fiche} moi={moi ?? null} raisonsAchat={raisons} />
          <ActionsOpa key={`opa-${fiche.insee}`} fiche={fiche} moi={moi ?? null} />

          {!aMoi && fiche.buildings.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold">Bâtiments</h3>
              <ul className="mt-1.5 text-sm">
                {fiche.buildings.map((b) => (
                  <li key={b.id} className="flex justify-between">
                    <span>{b.name}</span>
                    <span className="tabular-nums">niv. {b.level}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-xs text-ardoise">Sources : INSEE (BPE 2025), © contributeurs OpenStreetMap</p>
        </div>
      )}
    </section>
  );
}

/**
 * Silhouette de la commune, prise dans les communes déjà chargées pour la carte (la fiche n'a pas de
 * contour). Tant qu'elle n'y est pas, l'hexagone la remplace.
 */
function Silhouette({ insee, couleur }: { insee: string; couleur: string | null }) {
  const client = useQueryClient();
  // Relue quand une case de la carte finit de charger : la commune cherchée arrive souvent après sa fiche.
  const chargements = useIsFetching({ queryKey: ['carte', 'communes'] });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chargements` sert seulement à relire le cache
  const chemin = useMemo(() => {
    for (const [, reponse] of client.getQueriesData<TerritoiresReponse>({ queryKey: ['carte', 'communes'] })) {
      const commune = reponse?.features.find((c) => c.properties.insee === insee);
      if (commune) return silhouette([commune.geometry as Polygon | MultiPolygon], 64, 3);
    }
    return null;
  }, [client, insee, chargements]);

  return (
    <svg
      viewBox="0 0 64 64"
      className="size-[76px] shrink-0 -rotate-6 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] max-md:size-16"
      aria-hidden="true"
    >
      <path
        d={chemin ?? 'M32 6 55 19 53 45 32 58 11 45 9 19Z'}
        fill={couleur ?? 'rgb(232 234 237 / 0.16)'}
        fillOpacity={couleur ? 0.45 : 1}
        stroke="#ffd23f"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Une alvéole par place de bâtiment, pleine quand elle est prise (8 par ligne). */
function Alveoles({ used, total }: { used: number; total: number }) {
  return (
    <span className="flex max-w-[204px] shrink-0 flex-wrap gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: alvéoles identiques, leur nombre ne change pas
        <svg key={i} viewBox="0 0 22 24" className="h-6 w-[22px]" aria-hidden="true">
          <path
            d="M11 2 20 7v10l-9 5-9-5V7Z"
            strokeWidth={1.8}
            strokeLinejoin="round"
            className={i < used ? 'fill-surligneur stroke-surligneur' : 'fill-none stroke-[#4a4e56]'}
          />
        </svg>
      ))}
    </span>
  );
}

const ONGLETS: [OngletFiche, string][] = [
  ['infos', 'Commune'],
  ['batiments', 'Bâtiments'],
];

/** Onglets de la fiche (flèches gauche / droite pour passer de l'un à l'autre). */
function Onglets({
  onglet,
  definir,
  batiments,
}: {
  onglet: OngletFiche;
  definir: (onglet: OngletFiche) => void;
  batiments: string;
}) {
  const auClavier = (e: ToucheReact) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const suivant = onglet === 'infos' ? 'batiments' : 'infos';
    definir(suivant);
    document.getElementById(`fiche-onglet-${suivant}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Fiche de la commune"
      onKeyDown={auClavier}
      className="flex shrink-0 gap-5 px-5 text-sm font-bold max-md:px-[18px]"
    >
      {ONGLETS.map(([cle, libelle]) => (
        <button
          key={cle}
          id={`fiche-onglet-${cle}`}
          type="button"
          role="tab"
          aria-selected={onglet === cle}
          aria-controls={`fiche-panneau-${cle}`}
          tabIndex={onglet === cle ? 0 : -1}
          onClick={() => definir(cle)}
          data-tuto={cle === 'batiments' ? 'build-button' : undefined}
          className={`relative pt-1 pb-2.5 ${
            onglet === cle
              ? 'text-encre after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-sm after:bg-surligneur'
              : 'text-ardoise hover:text-encre'
          }`}
        >
          {libelle}
          {cle === 'batiments' && <span className="ml-1 font-normal tabular-nums">({batiments})</span>}
        </button>
      ))}
    </div>
  );
}
