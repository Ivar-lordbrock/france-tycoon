import type {
  ConfigConnexion,
  ConnexionReponse,
  FicheCommune,
  ModifierMoiCorps,
  MoiReponse,
} from '@france-tycoon/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErreurApi, envoyerJson, lireJson } from './client.ts';
import { CLE_TUTORIEL } from './tutoriel.ts';

/** Ce que l'écran de connexion propose (bouton Google, compte de test). */
export function useConfigConnexion() {
  return useQuery({
    queryKey: ['auth', 'config'],
    queryFn: ({ signal }) => lireJson<ConfigConnexion>('/api/v1/auth/config', signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Mon profil et mon portefeuille ; `null` si personne n'est connecté.
 * Relu toutes les 60 s une fois connecté (docs/04 § 4.4) ; déconnecté, rien à relire :
 * la connexion relance la lecture d'elle-même (`toutRelire`).
 */
export function useMoi() {
  return useQuery({
    queryKey: ['moi'],
    queryFn: async ({ signal }) => {
      try {
        return await lireJson<MoiReponse>('/api/v1/me', signal);
      } catch (erreur) {
        if (erreur instanceof ErreurApi && erreur.statut === 401) return null;
        throw erreur;
      }
    },
    refetchInterval: (query) => (query.state.data ? 60_000 : false),
  });
}

/** Lecture d'une fiche, partagée par `useFiche` et la liste « Mes territoires » (`fetchQuery`). */
export const optionsFiche = (insee: string | null) => ({
  queryKey: ['fiche', insee],
  queryFn: ({ signal }: { signal: AbortSignal }) => lireJson<FicheCommune>(`/api/v1/territories/${insee}`, signal),
  staleTime: 15_000,
});

export function useFiche(insee: string | null) {
  return useQuery({ ...optionsFiche(insee), enabled: insee !== null });
}

/** Après connexion ou déconnexion : profil, fiches et couleurs de la carte (« à moi ») changent. */
function toutRelire(client: QueryClient) {
  // Propres au joueur, et un tutoriel fini n'est plus relu : effacés (l'écran les relira pour le nouveau compte).
  client.removeQueries({ queryKey: CLE_TUTORIEL });
  client.removeQueries({ queryKey: ['quetes'] });
  return Promise.all([
    client.invalidateQueries({ queryKey: ['moi'] }),
    client.invalidateQueries({ queryKey: ['fiche'] }),
    client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
  ]);
}

export function useConnexion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (demande: { google: string } | { pseudo: string }) =>
      'google' in demande
        ? envoyerJson<ConnexionReponse>('/api/v1/auth/google', 'POST', { credential: demande.google })
        : envoyerJson<ConnexionReponse>('/api/v1/auth/dev', 'POST', { pseudo: demande.pseudo }),
    onSuccess: () => toutRelire(client),
  });
}

export function useDeconnexion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => envoyerJson<void>('/api/v1/auth/logout', 'POST'),
    onSettled: () => toutRelire(client),
  });
}

export function useModifierProfil() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (corps: ModifierMoiCorps) => envoyerJson<MoiReponse>('/api/v1/me', 'PATCH', corps),
    onSuccess: (moi) => {
      client.setQueryData(['moi'], moi);
      // La couleur du marqueur se voit sur la carte et dans les fiches.
      return Promise.all([
        client.invalidateQueries({ queryKey: ['fiche'] }),
        client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
      ]);
    },
  });
}
