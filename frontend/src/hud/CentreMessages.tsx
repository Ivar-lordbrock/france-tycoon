import type { NotificationJeu } from '@france-tycoon/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLireNotifications, useNotifications } from '../api/notifications.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { allerALaCommune } from '../panels/aller-a-la-commune.ts';
import { communeDe, ilYa, phraseNotification } from '../panels/notifications-texte.ts';

/**
 * Centre de notifications (volet de la barre du haut) : mes messages, les plus récents d'abord.
 * Un clic marque le message comme lu et ouvre la commune dont il parle.
 */
export function CentreMessages({ id, nonLus, onChoisi }: { id: string; nonLus: number; onChoisi: () => void }) {
  const client = useQueryClient();
  const liste = useNotifications(true);
  const lire = useLireNotifications();
  const maintenant = useMaintenant(30_000);

  const choisir = (n: NotificationJeu) => {
    if (n.readAt === null) lire.mutate({ ids: [n.id] });
    const commune = communeDe(n);
    if (!commune) return;
    onChoisi();
    void allerALaCommune(client, commune.insee, { onglet: commune.onglet });
  };

  let contenu: ReactNode;
  if (liste.isPending) contenu = <p className="p-3 text-sm text-ardoise">Chargement…</p>;
  else if (liste.isError)
    contenu = <p className="p-3 text-sm text-ardoise">Messages indisponibles : le serveur ne répond pas.</p>;
  else {
    const messages = liste.data.pages.flatMap((page) => page.notifications);
    contenu =
      messages.length === 0 ? (
        <p className="p-3 text-sm text-ardoise">
          Aucun message pour l’instant. Les OPA et les chantiers finis s’afficheront ici.
        </p>
      ) : (
        <ul className="max-h-80 overflow-y-auto py-1">
          {messages.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => choisir(n)}
                className={`flex w-full gap-2 px-3 py-2 text-left text-sm hover:bg-brume/60 ${n.readAt === null ? '' : 'text-ardoise'}`}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt === null ? 'bg-orange-500' : ''}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  {n.readAt === null && <span className="sr-only">Non lu : </span>}
                  <span className={n.readAt === null ? 'font-semibold' : ''}>{phraseNotification(n)}</span>
                  <span className="block text-xs text-ardoise">{ilYa(n.createdAt, maintenant)}</span>
                </span>
              </button>
            </li>
          ))}
          {liste.hasNextPage && (
            <li className="px-3 py-1.5">
              <button
                type="button"
                onClick={() => void liste.fetchNextPage()}
                disabled={liste.isFetchingNextPage}
                className="text-sm font-semibold text-ardoise underline hover:text-encre disabled:opacity-50"
              >
                {liste.isFetchingNextPage ? 'Chargement…' : 'Voir les plus anciens'}
              </button>
            </li>
          )}
        </ul>
      );
  }

  return (
    <div id={id} className="border-t border-encre/10">
      {nonLus > 0 && (
        <div className="flex justify-end border-b border-encre/10 px-3 py-1.5">
          <button
            type="button"
            onClick={() => lire.mutate({ all: true })}
            disabled={lire.isPending}
            className="text-xs font-semibold text-ardoise underline hover:text-encre disabled:opacity-50"
          >
            Tout marquer comme lu
          </button>
        </div>
      )}
      {contenu}
    </div>
  );
}
