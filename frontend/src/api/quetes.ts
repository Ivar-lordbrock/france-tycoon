import type {
  EncaissementReponse,
  MoiReponse,
  QuetesReponse,
  ReclamerQueteReponse,
  TypeSuivi,
} from '@france-tycoon/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { envoyerJson, lireJson } from './client.ts';
import { poserPortefeuille } from './territoires.ts';

// Quêtes du jour, bouton « Encaisser » et suivi de ce que seul l'écran voit (docs/04, « Quêtes, tutoriel, classement »).

/** Mes 3 quêtes du jour, lues quand le volet est ouvert. */
export function useQuetes(actif: boolean) {
  return useQuery({
    queryKey: ['quetes'],
    queryFn: ({ signal }) => lireJson<QuetesReponse>('/api/v1/me/quests', signal),
    enabled: actif,
    // Relues juste après minuit (heure de Paris) si le volet est resté ouvert.
    refetchInterval: (query) =>
      query.state.data ? Math.max(1_000, query.state.data.resetsAt * 1000 - Date.now()) : false,
  });
}

/** Après « Encaisser » : solde et revenu tout de suite (le montant en attente repart de 0), puis profil et quêtes relus. */
export function apresEncaissement(client: QueryClient, { cash, incomePerHour }: EncaissementReponse) {
  client.setQueryData<MoiReponse | null>(['moi'], (moi) =>
    moi ? { ...moi, wallet: { ...moi.wallet, cash }, incomePerHour } : moi,
  );
  // `moi` : récompense du tutoriel ; `quetes` : « Trésorier ».
  return Promise.all([
    client.invalidateQueries({ queryKey: ['moi'] }),
    client.invalidateQueries({ queryKey: ['quetes'] }),
  ]);
}

/** Seul ce clic compte pour le tutoriel (étape 7) et la quête « Trésorier ». */
export function useEncaisser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => envoyerJson<EncaissementReponse>('/api/v1/me/collect', 'POST'),
    onSuccess: (reponse) => apresEncaissement(client, reponse),
  });
}

/** Après une réclamation : la quête et le solde changent tout de suite, le profil est relu. */
export function apresReclamation(client: QueryClient, { quest, wallet }: ReclamerQueteReponse) {
  poserPortefeuille(client, wallet);
  client.setQueryData<QuetesReponse>(['quetes'], (liste) =>
    liste ? { ...liste, quests: liste.quests.map((q) => (q.id === quest.id ? quest : q)) } : liste,
  );
  return client.invalidateQueries({ queryKey: ['moi'] });
}

export function useReclamer() {
  const client = useQueryClient();
  return useMutation({
    // Pas de clé d'idempotence : une quête déjà réclamée est refusée (QUEST_NOT_CLAIMABLE), rien n'est payé deux fois.
    mutationFn: (id: number) => envoyerJson<ReclamerQueteReponse>(`/api/v1/me/quests/${id}/claim`, 'POST'),
    onSuccess: (reponse) => apresReclamation(client, reponse),
  });
}

/** Fiche ouverte, zone choisie… : fait avancer les quêtes. Sans réponse utile : un échec ne gêne pas le jeu. */
export function suivre(client: QueryClient, type: TypeSuivi, ref: string) {
  envoyerJson<void>('/api/v1/events/track', 'POST', { type, ref })
    .then(() => client.invalidateQueries({ queryKey: ['quetes'] }))
    .catch(() => {});
}
