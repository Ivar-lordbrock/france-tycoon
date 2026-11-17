import type { AchatReponse, MesTerritoires, MoiReponse, Portefeuille, VenteReponse } from '@france-tycoon/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { envoyerJson, lireJson } from './client.ts';

/** Clé de « Mes territoires » : sous `moi`, elle se relit avec le profil (connexion, déconnexion). */
export const CLE_MES_TERRITOIRES = ['moi', 'territoires'] as const;

/** Mes communes (capitale d'abord), lues seulement quand la liste est ouverte. */
export function useMesTerritoires(actif: boolean) {
  return useQuery({
    queryKey: CLE_MES_TERRITOIRES,
    queryFn: ({ signal }) => lireJson<MesTerritoires>('/api/v1/me/territories', signal),
    enabled: actif,
    staleTime: 15_000,
  });
}

/** Le cash change tout de suite à l'écran ; le reste du profil (territoires, revenu) est relu. */
function apresTransaction(client: QueryClient, wallet: Portefeuille) {
  client.setQueryData<MoiReponse | null>(['moi'], (moi) => (moi ? { ...moi, wallet } : moi));
  return Promise.all([
    client.invalidateQueries({ queryKey: ['moi'] }),
    // La commune change de couleur sur la carte.
    client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
  ]);
}

/** Après un refus (plus assez de cash, commune prise entre-temps…), la fiche et le profil sont relus. */
function apresRefus(client: QueryClient, insee: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['fiche', insee] }),
    client.invalidateQueries({ queryKey: ['moi'] }),
  ]);
}

/** Achat d'une commune libre au prix V0. `cle` : une par confirmation, pour ne jamais payer deux fois. */
export function useAcheter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ insee, cle }: { insee: string; cle: string }) =>
      envoyerJson<AchatReponse>(`/api/v1/territories/${insee}/buy`, 'POST', undefined, { cle }),
    onSuccess: ({ territory, wallet }) => {
      client.setQueryData(['fiche', territory.insee], territory);
      return apresTransaction(client, wallet);
    },
    onError: (_erreur, { insee }) => apresRefus(client, insee),
  });
}

/** Vente à l'État : 70 % de la valeur totale, bâtiments détruits. */
export function useVendre() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ insee, cle }: { insee: string; cle: string }) =>
      envoyerJson<VenteReponse>(`/api/v1/territories/${insee}/sell`, 'POST', undefined, { cle }),
    onSuccess: ({ insee, wallet }) =>
      Promise.all([client.invalidateQueries({ queryKey: ['fiche', insee] }), apresTransaction(client, wallet)]),
    onError: (_erreur, { insee }) => apresRefus(client, insee),
  });
}
