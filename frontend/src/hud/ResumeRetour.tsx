import type { MoiReponse } from '@france-tycoon/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useMarquerVus } from '../api/batiments.ts';
import { messageErreur } from '../api/client.ts';
import { allerALaCommune } from '../panels/aller-a-la-commune.ts';
import { phraseChantierFini, titreResume } from '../panels/batiments-texte.ts';
import { boutonSecondaire } from '../panels/Confirmer.tsx';

/** Ouverture de la page : un chantier fini avant, c'est « pendant ton absence ». */
const OUVERTURE = Math.floor(Date.now() / 1000);

/** Résumé au retour : les chantiers finis pas encore vus (docs/05, 5.3), jusqu'à « Compris ». */
export function ResumeRetour({ moi }: { moi: MoiReponse }) {
  const id = useId();
  const client = useQueryClient();
  const marquer = useMarquerVus();
  const finis = moi.finishedWorks;
  if (finis.length === 0) return null;

  // Les 5 plus récents d'abord.
  const recents = finis.slice(-5).reverse();
  const autres = finis.length - recents.length;

  return (
    <section aria-labelledby={`${id}-titre`} className="panneau pointer-events-auto w-full shrink-0 rounded-[22px] p-4">
      <h2 id={`${id}-titre`} className="font-semibold">
        {titreResume(finis, OUVERTURE)}
      </h2>
      <ul className="mt-1 flex flex-col text-sm">
        {recents.map((f) => (
          <li key={f.notificationId}>
            <button
              type="button"
              onClick={() => void allerALaCommune(client, f.territoryInsee, { onglet: 'batiments' })}
              className="-mx-1 w-[calc(100%+0.5rem)] rounded px-1 py-1 text-left hover:bg-brume/60"
            >
              {phraseChantierFini(f)}
            </button>
          </li>
        ))}
      </ul>
      {autres > 0 && (
        <p className="text-xs text-ardoise">
          et {autres} autre{autres > 1 ? 's' : ''}
        </p>
      )}
      {marquer.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {messageErreur(marquer.error)}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={marquer.isPending}
          onClick={() => marquer.mutate(finis.map((f) => f.notificationId))}
          className={boutonSecondaire}
        >
          Compris
        </button>
      </div>
    </section>
  );
}
