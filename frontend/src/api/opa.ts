import type { DetailOpaReponse, DevisOpa, MesOpaReponse, Opa, OpaReponse } from '@france-tycoon/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErreurApi, envoyerJson, lireJson } from './client.ts';
import { apresRefus, poserPortefeuille } from './territoires.ts';

// OPA (docs/04 « PvP : OPA ») : devis, lancement, réponses, mes OPA en cours.

/** Mes OPA en cours : sous `moi`, elles se relisent avec le profil (connexion, déconnexion, actions). */
export const CLE_MES_OPA = ['moi', 'opa'] as const;

/** Mes OPA en cours (reçues et lancées), relues toutes les 60 s comme /me. */
export function useMesOpaEnCours(actif: boolean) {
  return useQuery({
    queryKey: CLE_MES_OPA,
    queryFn: async ({ signal }) =>
      (await lireJson<MesOpaReponse>('/api/v1/me/takeovers?status=pending', signal)).takeovers,
    enabled: actif,
    refetchInterval: 60_000,
  });
}

/** Les montants qui seraient figés maintenant ; lus à l'ouverture de la confirmation, jamais gardés. */
export function useDevisOpa(insee: string, actif: boolean) {
  return useQuery({
    queryKey: ['opa', 'devis', insee],
    queryFn: ({ signal }) => lireJson<DevisOpa>(`/api/v1/territories/${insee}/takeover-quote`, signal),
    enabled: actif,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Une OPA vue par moi ; `null` si je n'y joue aucun rôle (le serveur répond 404). */
export function useOpa(id: number | null) {
  return useQuery({
    queryKey: ['opa', id],
    queryFn: async ({ signal }) => {
      try {
        return (await lireJson<DetailOpaReponse>(`/api/v1/takeovers/${id}`, signal)).takeover;
      } catch (erreur) {
        if (erreur instanceof ErreurApi && erreur.statut === 404) return null;
        throw erreur;
      }
    },
    enabled: id !== null,
    staleTime: 15_000,
  });
}

/** Après une OPA lancée ou terminée : cash tout de suite, puis profil, fiche, carte et mes OPA relus. */
function apresOpa(client: QueryClient, { takeover, wallet }: OpaReponse) {
  poserPortefeuille(client, wallet);
  client.setQueryData<Opa | null>(['opa', takeover.id], takeover);
  return Promise.all([
    client.invalidateQueries({ queryKey: ['moi'] }),
    client.invalidateQueries({ queryKey: ['fiche', takeover.territory.insee] }),
    client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
  ]);
}

/** Lancer une OPA : l'offre est bloquée 24 h. `cle` : une par confirmation, pour ne jamais payer deux fois. */
export function useLancerOpa() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ insee, cle }: { insee: string; cle: string }) =>
      envoyerJson<OpaReponse>(`/api/v1/territories/${insee}/takeovers`, 'POST', undefined, { cle }),
    onSuccess: (reponse) => apresOpa(client, reponse),
    onError: (_erreur, { insee }) => apresRefus(client, insee),
  });
}

/** Les trois réponses possibles : défendre ou accepter (défenseur), retirer (attaquant). */
export type ReponseOpa = 'defend' | 'accept' | 'cancel';

export function useRepondreOpa() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ opa, reponse, cle }: { opa: Opa; reponse: ReponseOpa; cle: string }) =>
      // Accepter n'a pas de clé : accepter deux fois ne paie rien de plus (la 2e réponse est un refus).
      envoyerJson<OpaReponse>(`/api/v1/takeovers/${opa.id}/${reponse}`, 'POST', undefined, {
        cle: reponse === 'accept' ? undefined : cle,
      }),
    onSuccess: (reponse) => apresOpa(client, reponse),
    // OPA déjà terminée, plus assez de cash… : on relit tout ce qui la montre.
    onError: (_erreur, { opa }) =>
      Promise.all([apresRefus(client, opa.territory.insee), client.invalidateQueries({ queryKey: ['opa', opa.id] })]),
  });
}
