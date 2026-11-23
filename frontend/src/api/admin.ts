import type { AdminMoiReponse, VueEnsembleReponse } from '@france-tycoon/shared';
import { useQuery } from '@tanstack/react-query';
import { ErreurApi, lireJson } from './client.ts';

/** Grade dans l'équipe (GET /admin/me). Un 401 ou un 403 est une réponse, pas une panne : pas de nouvel essai. */
export function useAdminMoi() {
  return useQuery({
    queryKey: ['admin', 'moi'],
    queryFn: ({ signal }) => lireJson<AdminMoiReponse>('/api/v1/admin/me', signal),
    retry: (essais, erreur) => !(erreur instanceof ErreurApi && erreur.statut < 500) && essais < 2,
  });
}

/** Chiffres clés et santé du serveur (GET /admin/overview), relus chaque minute. */
export function useVueEnsemble() {
  return useQuery({
    queryKey: ['admin', 'vue-ensemble'],
    queryFn: ({ signal }) => lireJson<VueEnsembleReponse>('/api/v1/admin/overview', signal),
    refetchInterval: 60_000,
  });
}
