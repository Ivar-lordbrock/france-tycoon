import { useEffect } from 'react';
import { useFiche, useMoi } from '../api/compte.ts';
import { useCarte } from '../etat/carte.ts';
import { entier, LIBELLES_EQUIPEMENTS, lieu, proprietaire, raisonAchat, tycoons } from './fiche-texte.ts';

/** Fiche de la commune choisie (clic sur la carte ou recherche). Échap la ferme. */
export function FicheCommune() {
  const selection = useCarte((etat) => etat.selection);
  const definirSelection = useCarte((etat) => etat.definirSelection);
  const { data: fiche, isPending, isError } = useFiche(selection);
  const { data: moi } = useMoi();

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
      <section className="panneau pointer-events-auto flex items-start justify-between gap-2 p-4" aria-live="polite">
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

  return (
    <section
      aria-labelledby="fiche-titre"
      className="panneau pointer-events-auto flex max-h-[min(70dvh,40rem)] flex-col overflow-hidden"
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

      <div className="overflow-y-auto p-4 pt-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {couleur && <span className="size-3 rounded-full" style={{ background: couleur }} aria-hidden="true" />}
          {proprietaire(fiche)}
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

        {fiche.state === 'free' && (
          <p className={`mt-3 rounded-md px-3 py-2 text-sm ${fiche.actions.canBuy ? 'bg-brume' : 'bg-surligneur/30'}`}>
            {fiche.actions.canBuy ? 'Dans tes moyens.' : raisons.join(' ')}
          </p>
        )}

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

        {fiche.buildings.length > 0 && (
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
    </section>
  );
}
