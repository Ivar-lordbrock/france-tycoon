import type { ClassementReponse, PorteeClassement, ProfilPublic } from '@france-tycoon/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { lireJson } from './client.ts';

// Classement et profils publics (docs/04, « Classement ») : recalculés toutes les 10 min côté serveur,
// relus à chaque ouverture du volet.

/** 50 joueurs par page ; « Voir plus » charge les suivants. */
export function useClassement(portee: PorteeClassement) {
  return useInfiniteQuery({
    queryKey: ['classement', portee],
    queryFn: ({ pageParam, signal }) =>
      lireJson<ClassementReponse>(
        `/api/v1/leaderboard?scope=${portee}${pageParam === null ? '' : `&cursor=${pageParam}`}`,
        signal,
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useProfil(pseudo: string) {
  return useQuery({
    queryKey: ['joueur', pseudo],
    queryFn: ({ signal }) => lireJson<ProfilPublic>(`/api/v1/players/${encodeURIComponent(pseudo)}`, signal),
  });
}
