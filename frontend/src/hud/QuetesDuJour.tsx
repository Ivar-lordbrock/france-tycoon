import type { ReactNode } from 'react';
import { messageErreur } from '../api/client.ts';
import { useQuetes, useReclamer } from '../api/quetes.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { minuteur } from '../panels/batiments-texte.ts';
import { recompenseQuete } from '../panels/notifications-texte.ts';

/** Mes 3 quêtes du jour : avancement, récompense à réclamer, temps avant les suivantes (minuit à Paris). */
export function QuetesDuJour({ id }: { id: string }) {
  const { data, isPending, isError } = useQuetes(true);
  const reclamer = useReclamer();
  const maintenant = useMaintenant(1_000);

  let contenu: ReactNode;
  if (isPending) contenu = <p className="p-3 text-sm text-ardoise">Chargement…</p>;
  else if (isError)
    contenu = <p className="p-3 text-sm text-ardoise">Quêtes indisponibles : le serveur ne répond pas.</p>;
  else {
    contenu = (
      <>
        <ul className="max-h-72 overflow-y-auto">
          {data.quests.map((q) => (
            <li key={q.id} className="px-3 py-2">
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{q.title}</span>
                <span className="shrink-0 tabular-nums text-ardoise">
                  {q.progress} / {q.target}
                </span>
              </p>
              <p className="text-xs text-ardoise">{q.description}</p>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-brume" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-encre"
                  style={{ width: `${(q.progress / q.target) * 100}%` }}
                />
              </span>
              <p className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="tabular-nums">{recompenseQuete(q)}</span>
                {q.claimedAt !== null ? (
                  <span className="text-ardoise">Récompense reçue ✓</span>
                ) : (
                  q.completedAt !== null && (
                    <button
                      type="button"
                      onClick={() => reclamer.mutate(q.id)}
                      disabled={reclamer.isPending}
                      className="h-8 rounded-md bg-surligneur px-3 font-semibold text-encre hover:bg-surligneur/80 disabled:opacity-50"
                    >
                      Réclamer
                    </button>
                  )
                )}
              </p>
            </li>
          ))}
        </ul>
        {reclamer.isError && (
          <p role="alert" className="px-3 pb-2 text-sm text-red-700">
            {messageErreur(reclamer.error)}
          </p>
        )}
        <p className="border-t border-encre/10 px-3 py-2 text-xs text-ardoise tabular-nums">
          Nouvelles quêtes dans {minuteur(data.resetsAt - maintenant)}
        </p>
      </>
    );
  }

  return (
    <div id={id} className="border-t border-encre/10">
      {contenu}
    </div>
  );
}
