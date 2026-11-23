import type { FeuilleDeRouteReponse } from '@france-tycoon/shared';
import { useQuery } from '@tanstack/react-query';
import { lireJson } from './client.ts';

/** Feuille de route publique (GET /roadmap) : lisible sans être connecté. */
export function useFeuilleDeRoute() {
  return useQuery({
    queryKey: ['feuille-de-route'],
    queryFn: ({ signal }) => lireJson<FeuilleDeRouteReponse>('/api/v1/roadmap', signal),
  });
}
