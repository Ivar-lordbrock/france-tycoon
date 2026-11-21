import type { EtapeFaiteReponse, EtapeTutoriel, TutorielReponse } from '@france-tycoon/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { envoyerJson, lireJson } from './client.ts';
import { poserPortefeuille } from './territoires.ts';

// Tutoriel en 10 étapes (docs/04, « Quêtes, tutoriel, classement » ; règles dans docs/05, 5.7).

/** Sous `moi` : relu après un achat, un chantier fini ou un encaissement, qui valident les étapes « serveur ». */
export const CLE_TUTORIEL = ['moi', 'tutoriel'] as const;

export const tutorielFini = (t: TutorielReponse | undefined) =>
  t !== undefined && (t.completedAt !== null || t.skipped);

/** L'étape à montrer : la première pas encore faite ; `null` si le tutoriel est fini ou passé. */
export function etapeEnCours(t: TutorielReponse | undefined): EtapeTutoriel | null {
  if (!t || tutorielFini(t)) return null;
  return t.steps.find((s) => s.completedAt === null) ?? null;
}

export function useTutoriel(actif: boolean) {
  return useQuery({
    queryKey: CLE_TUTORIEL,
    queryFn: ({ signal }) => lireJson<TutorielReponse>('/api/v1/tutorial', signal),
    // Fini ou passé : plus rien ne change, inutile de le relire.
    enabled: (query) => actif && !tutorielFini(query.state.data),
  });
}

/** Après une étape « écran » : le tutoriel et le solde (récompense) changent tout de suite. */
export function apresEtape(client: QueryClient, { wallet, ...tutoriel }: EtapeFaiteReponse) {
  poserPortefeuille(client, wallet);
  client.setQueryData<TutorielReponse>(CLE_TUTORIEL, tutoriel);
}

export function useFaireEtape() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cle: string) => envoyerJson<EtapeFaiteReponse>(`/api/v1/tutorial/${cle}/complete`, 'POST'),
    onSuccess: (reponse) => apresEtape(client, reponse),
  });
}

export function usePasserTutoriel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => envoyerJson<TutorielReponse>('/api/v1/tutorial/skip', 'POST'),
    onSuccess: (tutoriel) => client.setQueryData(CLE_TUTORIEL, tutoriel),
  });
}
