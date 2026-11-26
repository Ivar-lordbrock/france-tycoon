import type { ReactNode } from 'react';
import { messageErreur } from '../api/client.ts';
import { useAppelAProjets, useQuetes, useReclamer } from '../api/quetes.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { minuteur } from '../panels/batiments-texte.ts';
import { entier } from '../panels/fiche-texte.ts';
import { recompenseQuete } from '../panels/notifications-texte.ts';
import { Icone, Piece } from './Icone.tsx';

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
        <AppelAProjets maintenant={maintenant} />
        <p className="px-3 text-[13px] text-ardoise tabular-nums">
          De nouvelles quêtes dans {minuteur(data.resetsAt - maintenant)}
        </p>
        <ul className="mt-1">
          {data.quests.map((q) => {
            const prete = q.completedAt !== null && q.claimedAt === null;
            const recue = q.claimedAt !== null;
            return (
              <li
                key={q.id}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-encre/[0.06] px-3 py-3 [&+&]:border-t"
              >
                <span
                  className={`grid size-11 place-items-center rounded-[14px] ${
                    prete ? 'bg-surligneur text-fond shadow-[inset_0_-3px_0_#c9a21a]' : 'bg-brume text-encre'
                  }`}
                >
                  <Icone nom={recue ? 'coche' : 'drapeau'} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold">{q.title}</h3>
                  <p className="mt-0.5 text-[13px] text-ardoise">{q.description}</p>
                  <Crans fait={q.progress} but={q.target} />
                  <span className="sr-only">
                    {q.progress} sur {q.target}
                  </span>
                </div>
                {prete ? (
                  <button
                    type="button"
                    onClick={() => reclamer.mutate(q.id)}
                    disabled={reclamer.isPending}
                    aria-label={`Réclamer +${recompenseQuete(q)}`}
                    className="relief relief-jaune h-10 rounded-[14px] px-3.5 text-sm whitespace-nowrap tabular-nums"
                  >
                    +{recompenseQuete(q)}
                  </button>
                ) : recue ? (
                  <span className="text-sm text-ardoise">Reçue</span>
                ) : (
                  <span className="flex flex-col items-end gap-1 text-sm font-bold tabular-nums">
                    <span className="sr-only">Récompense : {recompenseQuete(q)}</span>
                    {q.rewardCash > 0 && (
                      <span className="flex items-center gap-1.5" aria-hidden="true">
                        <Piece />
                        {entier(q.rewardCash)}
                      </span>
                    )}
                    {q.rewardGems > 0 && (
                      <span className="flex items-center gap-1.5 text-[#c4b5fd]" aria-hidden="true">
                        <Icone nom="gemme" className="size-4" />
                        {entier(q.rewardGems)}
                      </span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {reclamer.isError && (
          <p role="alert" className="px-3 pb-2 text-sm text-danger">
            {messageErreur(reclamer.error)}
          </p>
        )}
      </>
    );
  }

  return <div id={id}>{contenu}</div>;
}

/** L'appel à projets de la semaine : un objectif commun à tous ; réussi, la prime est versée sans bouton. */
function AppelAProjets({ maintenant }: { maintenant: number }) {
  const { data } = useAppelAProjets(true);
  if (!data) return null;
  const p = data.project;
  const reussi = p.completedAt !== null;
  return (
    <section
      aria-labelledby="appel-a-projets"
      className="mx-3 mb-3 rounded-[14px] border border-surligneur/30 bg-surligneur/[0.06] p-3"
    >
      <p className="text-[11px] font-bold tracking-wide text-surligneur uppercase">Appel à projets de l’État</p>
      <h3 id="appel-a-projets" className="mt-0.5 text-[15px] font-bold">
        {p.title}
      </h3>
      <p className="mt-0.5 text-[13px] text-ardoise">{p.description}</p>
      <Crans fait={p.progress} but={p.target} />
      <span className="sr-only">
        {p.progress} sur {p.target}
      </span>
      <p className="mt-2 flex items-center justify-between gap-3 text-[13px] tabular-nums">
        <span className="text-ardoise">
          {reussi ? 'Réussi : prime versée' : `Fin dans ${minuteur(data.endsAt - maintenant)}`}
        </span>
        <span className="flex items-center gap-2 font-bold">
          <span className="sr-only">Prime : {recompenseQuete(p)}</span>
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <Piece />
            {entier(p.rewardCash)}
          </span>
          {p.rewardGems > 0 && (
            <span className="flex items-center gap-1.5 text-[#c4b5fd]" aria-hidden="true">
              <Icone nom="gemme" className="size-4" />
              {entier(p.rewardGems)}
            </span>
          )}
        </span>
      </p>
    </section>
  );
}

/** Avancement en crans (un par action) ; au-delà de 10, une barre continue. */
function Crans({ fait, but }: { fait: number; but: number }) {
  if (but > 10) {
    return (
      <span className="mt-[7px] block h-1.5 overflow-hidden rounded-[3px] bg-brume" aria-hidden="true">
        <span className="block h-full rounded-[3px] bg-succes" style={{ width: `${Math.min(1, fait / but) * 100}%` }} />
      </span>
    );
  }
  return (
    <span className="mt-[7px] flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: but }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: crans identiques, leur nombre ne change pas
        <span key={i} className={`h-1.5 flex-1 rounded-[3px] ${i < fait ? 'bg-succes' : 'bg-brume'}`} />
      ))}
    </span>
  );
}
