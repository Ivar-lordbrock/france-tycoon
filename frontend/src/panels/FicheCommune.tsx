import { useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent as ToucheReact, useEffect } from 'react';
import { useFiche, useMoi } from '../api/compte.ts';
import { suivre } from '../api/quetes.ts';
import { type OngletFiche, useCarte } from '../etat/carte.ts';
import { ActionsFiche } from './ActionsFiche.tsx';
import { ActionsOpa } from './ActionsOpa.tsx';
import { entier, LIBELLES_EQUIPEMENTS, lieu, proprietaire, raisonAchat, tycoons } from './fiche-texte.ts';
import { OngletBatiments } from './OngletBatiments.tsx';
import { estAMoi } from './territoires-texte.ts';

/** Fiche de la commune choisie (clic sur la carte ou recherche). Échap la ferme. */
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

  const fermer = (
    <button
      type="button"
      onClick={() => definirSelection(null)}
      className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-md text-ardoise hover:bg-brume hover:text-encre"
      aria-label="Fermer la fiche"
    >
      <svg viewBox="0 0 20 20" className="size-4 stroke-current stroke-2" aria-hidden="true">
        <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
      </svg>
    </button>
  );

  if (isPending || isError || !fiche) {
    return (
      <section
        className="fiche panneau pointer-events-auto flex items-start justify-between gap-2 p-4"
        aria-live="polite"
      >
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
  // Sur mes communes, deux onglets : la commune, et ses bâtiments.
  const aMoi = estAMoi(fiche) && moi != null;

  return (
    <section
      aria-labelledby="fiche-titre"
      data-tuto="territory-panel"
      className="fiche panneau pointer-events-auto flex max-h-[min(70dvh,40rem)] min-h-0 flex-col overflow-hidden"
    >
      <header className="flex items-start justify-between gap-2 border-b border-encre/10 p-4 pb-3">
        <div className="min-w-0">
          <h2 id="fiche-titre" className="marque truncate text-lg">
            {fiche.name}
          </h2>
          <p className="mt-1 text-sm text-ardoise">
            {lieu(fiche)} · {entier(fiche.population)} habitant{fiche.population > 1 ? 's' : ''}
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
          className="overflow-y-auto p-4 pt-3"
        >
          <OngletBatiments fiche={fiche} moi={moi} />
        </div>
      ) : (
        <div
          id="fiche-panneau-infos"
          {...(aMoi ? { role: 'tabpanel', 'aria-labelledby': 'fiche-onglet-infos' } : {})}
          className="overflow-y-auto p-4 pt-3"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            {couleur && <span className="size-3 rounded-full" style={{ background: couleur }} aria-hidden="true" />}
            {proprietaire(fiche)}
            {fiche.isCapital && (
              <span className="rounded bg-surligneur px-1.5 py-0.5 text-xs font-semibold">Capitale</span>
            )}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div>
              <dt className="text-xs text-ardoise">{fiche.state === 'free' ? 'Prix' : 'Valeur'}</dt>
              <dd className="text-lg font-bold tabular-nums">
                {tycoons(fiche.state === 'free' ? fiche.baseValue : fiche.totalValue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ardoise">Revenu</dt>
              <dd className="text-lg font-bold tabular-nums">{tycoons(fiche.incomePerHour)} /h</dd>
            </div>
            <div>
              <dt className="text-xs text-ardoise">Emplacements</dt>
              <dd className="tabular-nums">
                {fiche.buildingSlots.used} / {fiche.buildingSlots.total}
              </dd>
            </div>
            {fiche.areaKm2 !== null && (
              <div>
                <dt className="text-xs text-ardoise">Surface</dt>
                <dd className="tabular-nums">{entier(Math.round(fiche.areaKm2))} km²</dd>
              </div>
            )}
          </dl>

          <ActionsFiche key={fiche.insee} fiche={fiche} moi={moi ?? null} raisonsAchat={raisons} />
          <ActionsOpa key={`opa-${fiche.insee}`} fiche={fiche} moi={moi ?? null} />

          <h3 className="mt-4 text-sm font-semibold">Équipements</h3>
          {fiche.equipments.length === 0 ? (
            <p className="mt-1 text-sm text-ardoise">Aucun équipement recensé.</p>
          ) : (
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {fiche.equipments.map((e) => (
                <li key={e.category} className="flex justify-between gap-2">
                  <span className="truncate text-ardoise">{LIBELLES_EQUIPEMENTS[e.category]}</span>
                  <span className="tabular-nums">{entier(e.count)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ardoise">Sources : INSEE (BPE 2025), © contributeurs OpenStreetMap</p>

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
        </div>
      )}
    </section>
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
      className="flex gap-1 border-b border-encre/10 px-3"
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
          className={`-mb-px border-b-2 px-2 py-2 text-sm font-semibold ${
            onglet === cle ? 'border-encre text-encre' : 'border-transparent text-ardoise hover:text-encre'
          }`}
        >
          {libelle}
          {cle === 'batiments' && <span className="ml-1 font-normal tabular-nums">({batiments})</span>}
        </button>
      ))}
    </div>
  );
}
