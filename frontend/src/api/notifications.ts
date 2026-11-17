import type {
  LireNotificationsCorps,
  LireNotificationsReponse,
  MoiReponse,
  NotificationsReponse,
} from '@france-tycoon/shared';
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { ajouterToast } from '../etat/toasts.ts';
import { envoyerJson, lireJson, messageErreur } from './client.ts';

/** Le centre de notifications : sous `moi`, il se relit avec le profil (et à chaque message en direct). */
export const CLE_NOTIFICATIONS = ['moi', 'notifications'] as const;

/** Mes messages, les plus récents d'abord, 20 par page ; « Voir plus » charge la page d'avant. */
export function useNotifications(actif: boolean) {
  return useInfiniteQuery({
    queryKey: CLE_NOTIFICATIONS,
    queryFn: ({ pageParam, signal }) =>
      lireJson<NotificationsReponse>(
        `/api/v1/me/notifications${pageParam === null ? '' : `?before=${pageParam}`}`,
        signal,
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: actif,
  });
}

/** Après une lecture : le nombre de non lus, le résumé au retour et la liste changent tout de suite. */
export function apresLecture(
  client: QueryClient,
  corps: LireNotificationsCorps,
  { unreadNotifications }: LireNotificationsReponse,
) {
  const lu = (id: number) => 'all' in corps || corps.ids.includes(id);
  client.setQueryData<MoiReponse | null>(['moi'], (moi) =>
    moi ? { ...moi, unreadNotifications, finishedWorks: moi.finishedWorks.filter((f) => !lu(f.notificationId)) } : moi,
  );
  const maintenant = Math.floor(Date.now() / 1000);
  client.setQueryData<InfiniteData<NotificationsReponse, number | null>>(CLE_NOTIFICATIONS, (liste) =>
    liste
      ? {
          ...liste,
          pages: liste.pages.map((page) => ({
            ...page,
            unreadNotifications,
            notifications: page.notifications.map((n) =>
              n.readAt === null && lu(n.id) ? { ...n, readAt: maintenant } : n,
            ),
          })),
        }
      : liste,
  );
}

/** Marquer des messages comme lus (par numéro, ou tous). Un échec s'affiche en petit message. */
export function useLireNotifications() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (corps: LireNotificationsCorps) =>
      envoyerJson<LireNotificationsReponse>('/api/v1/me/notifications/read', 'POST', corps),
    onSuccess: (reponse, corps) => apresLecture(client, corps, reponse),
    onError: (erreur) => ajouterToast({ texte: messageErreur(erreur), ton: 'erreur' }),
  });
}
