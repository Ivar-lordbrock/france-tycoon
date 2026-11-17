import type { MonTerritoire } from '@france-tycoon/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { optionsFiche } from '../api/compte.ts';
import { useMesTerritoires } from '../api/territoires.ts';
import { useCarte } from '../etat/carte.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { allerVersCentre } from '../map/navigation.ts';
import { tycoons } from './fiche-texte.ts';
import { detailsTerritoire } from './territoires-texte.ts';

/** Mes communes, capitale d'abord. Un clic ouvre la fiche et amène la carte dessus. */
export function MesTerritoires({ id, onChoisi }: { id: string; onChoisi: () => void }) {
  const { data, isPending, isError } = useMesTerritoires(true);
  const maintenant = useMaintenant(30_000);
  const carte = useCarte((etat) => etat.carte);
  const client = useQueryClient();

  const choisir = async (t: MonTerritoire) => {
    const { definirSelection, definirVueActive } = useCarte.getState();
    definirSelection(t.insee);
    definirVueActive(t.zone);
    onChoisi();
    // Le centre de la commune est dans sa fiche, qu'on lit de toute façon pour l'afficher.
    const fiche = await client.fetchQuery(optionsFiche(t.insee)).catch(() => null);
    if (fiche && carte) allerVersCentre(carte, fiche.center, t.zone);
  };

  let contenu: ReactNode;
  if (isPending) contenu = <p className="p-3 text-sm text-ardoise">Chargement…</p>;
  else if (isError)
    contenu = <p className="p-3 text-sm text-ardoise">Liste indisponible : le serveur ne répond pas.</p>;
  else if (data.territories.length === 0) {
    contenu = (
      <p className="p-3 text-sm text-ardoise">
        Tu n’as pas encore de commune. Clique sur une commune libre de la carte : sa fiche te dit si tu peux l’acheter.
      </p>
    );
  } else {
    contenu = (
      <ul className="max-h-72 overflow-y-auto py-1">
        {data.territories.map((t) => (
          <li key={t.insee}>
            <button
              type="button"
              onClick={() => choisir(t)}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-brume/60"
            >
              <span className="flex w-full items-center gap-2">
                <span className="truncate font-semibold">{t.name}</span>
                {t.isCapital && (
                  <span className="shrink-0 rounded bg-surligneur px-1.5 py-0.5 text-xs font-semibold">Capitale</span>
                )}
                <span className="ml-auto shrink-0 text-sm tabular-nums">{tycoons(t.incomePerHour)}/h</span>
              </span>
              <span className="text-xs text-ardoise">{detailsTerritoire(t, maintenant)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div id={id} className="border-t border-encre/10">
      {contenu}
    </div>
  );
}
