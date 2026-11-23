import type { EtatSite } from '@france-tycoon/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { envoyerJson, lireJson } from './client.ts';

/** Maintenance et bannière (GET /status), relues chaque minute : l'équipe peut les changer en direct. */
export function useEtatSite() {
  return useQuery({
    queryKey: ['etat-site'],
    queryFn: ({ signal }) => lireJson<EtatSite>('/api/v1/status', signal),
    refetchInterval: 60_000,
  });
}

/** « Signaler un bug » (POST /reports) : l'équipe le lit dans le dashboard. */
export function useSignaler() {
  return useMutation({
    mutationFn: (corps: { body: string; page: string }) => envoyerJson<void>('/api/v1/reports', 'POST', corps),
  });
}
