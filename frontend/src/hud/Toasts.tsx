import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DUREE_TOAST, type Toast, useToasts } from '../etat/toasts.ts';
import { allerALaCommune } from '../panels/aller-a-la-commune.ts';

const BORD: Record<Toast['ton'], string> = {
  info: 'border-l-encre',
  alerte: 'border-l-orange-500',
  erreur: 'border-l-red-600',
};

/**
 * Petits messages par-dessus la carte : en haut au milieu sur grand écran, au-dessus de la barre
 * du bas sur téléphone. La zone existe toujours, pour que les lecteurs d'écran annoncent les nouveaux.
 */
export function Toasts() {
  const toasts = useToasts((etat) => etat.toasts);
  return (
    <section
      aria-label="Messages"
      className="pointer-events-none absolute inset-x-4 bottom-36 z-[1100] md:inset-x-auto md:top-4 md:bottom-auto md:left-1/2 md:w-[min(26rem,calc(100%-44rem))] md:-translate-x-1/2"
    >
      <ol aria-live="polite" className="flex flex-col gap-2">
        {toasts.map((toast) => (
          <ElementToast key={toast.id} toast={toast} />
        ))}
      </ol>
    </section>
  );
}

function ElementToast({ toast }: { toast: Toast }) {
  const client = useQueryClient();
  const retirer = useToasts((etat) => etat.retirer);
  const [enPause, setEnPause] = useState(false);

  // Disparaît tout seul, sauf tant que la souris ou le clavier est dessus.
  useEffect(() => {
    if (enPause) return;
    const minuterie = window.setTimeout(() => retirer(toast.id), DUREE_TOAST[toast.ton]);
    return () => window.clearTimeout(minuterie);
  }, [enPause, retirer, toast.id, toast.ton]);

  const { commune, libelle } = toast;
  return (
    <li
      role={toast.ton === 'erreur' ? 'alert' : undefined}
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
      onFocus={() => setEnPause(true)}
      onBlur={() => setEnPause(false)}
      className={`panneau entree-toast pointer-events-auto flex items-start gap-2 border-l-4 py-2 pr-1.5 pl-3 text-sm ${BORD[toast.ton]}`}
    >
      <p className="min-w-0 flex-1 py-1">{toast.texte}</p>
      {commune && libelle && (
        <button
          type="button"
          onClick={() => {
            retirer(toast.id);
            void allerALaCommune(client, commune.insee, { onglet: commune.onglet });
          }}
          className="shrink-0 rounded-md px-2 py-1 font-semibold underline hover:bg-brume"
        >
          {libelle}
        </button>
      )}
      <button
        type="button"
        onClick={() => retirer(toast.id)}
        aria-label="Fermer le message"
        className="grid size-7 shrink-0 place-items-center rounded-md text-ardoise hover:bg-brume hover:text-encre"
      >
        <svg viewBox="0 0 20 20" className="size-4 stroke-current stroke-2" fill="none" aria-hidden="true">
          <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}
