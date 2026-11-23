import type {
  AdminMoiReponse,
  CadeauCorps,
  CadeauReponse,
  EtatSite,
  FicheJoueurReponse,
  ListeCommunesAdminReponse,
  ListeJoueursReponse,
  ListeOpaAdminReponse,
  ListeSauvegardesReponse,
  ListeSignalementsReponse,
  SauvegardeReponse,
  StatutOpa,
  StatutSignalement,
  VueEnsembleReponse,
} from '@france-tycoon/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErreurApi, envoyerJson, lireJson } from './client.ts';

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

export interface FiltresJoueurs {
  q: string;
  role: '' | 'player' | 'moderator' | 'admin';
  status: '' | 'active' | 'dormant' | 'banned' | 'suspended';
}

/** Recherche de joueurs (GET /admin/players) ; l'ancienne liste reste affichée pendant la lecture. */
export function useRechercheJoueurs(filtres: FiltresJoueurs) {
  const params = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v));
  return useQuery({
    queryKey: ['admin', 'joueurs', filtres],
    queryFn: ({ signal }) => lireJson<ListeJoueursReponse>(`/api/v1/admin/players?${params}`, signal),
    placeholderData: keepPreviousData,
  });
}

/** Fiche complète d'un joueur (GET /admin/players/:id). */
export function useFicheJoueur(id: number) {
  return useQuery({
    queryKey: ['admin', 'joueur', id],
    queryFn: ({ signal }) => lireJson<FicheJoueurReponse>(`/api/v1/admin/players/${id}`, signal),
  });
}

export interface FiltresCommunes {
  q: string;
  filter: '' | 'owned' | 'free' | 'forced' | 'takeover';
}

/** Recherche de communes (GET /admin/territories). */
export function useRechercheCommunes(filtres: FiltresCommunes) {
  const params = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v));
  return useQuery({
    queryKey: ['admin', 'communes', filtres],
    queryFn: ({ signal }) => lireJson<ListeCommunesAdminReponse>(`/api/v1/admin/territories?${params}`, signal),
    placeholderData: keepPreviousData,
  });
}

/** OPA d'un statut (GET /admin/takeovers), les plus récentes d'abord. */
export function useOpaAdmin(status: StatutOpa) {
  return useQuery({
    queryKey: ['admin', 'opa', status],
    queryFn: ({ signal }) => lireJson<ListeOpaAdminReponse>(`/api/v1/admin/takeovers?status=${status}`, signal),
    placeholderData: keepPreviousData,
  });
}

export interface ActionAdmin {
  methode: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Chemin après /api/v1/admin/, ex. `players/12/suspend`. */
  url: string;
  corps?: unknown;
}

/** Toute action du dashboard (204) ; ensuite les listes et fiches de l'équipe sont relues. */
export function useActionAdmin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ methode, url, corps }: ActionAdmin) => envoyerJson<void>(`/api/v1/admin/${url}`, methode, corps),
    onSettled: () => client.invalidateQueries({ queryKey: ['admin'], predicate: (q) => q.queryKey[1] !== 'moi' }),
  });
}

/** Maintenance et bannière telles que les joueurs les voient (GET /status), relues après chaque action. */
export function useSiteAdmin() {
  return useQuery({
    queryKey: ['admin', 'site'],
    queryFn: ({ signal }) => lireJson<EtatSite>('/api/v1/status', signal),
  });
}

/** Signalements d'un statut (GET /admin/reports), les plus récents d'abord. */
export function useSignalementsAdmin(status: StatutSignalement) {
  return useQuery({
    queryKey: ['admin', 'signalements', status],
    queryFn: ({ signal }) => lireJson<ListeSignalementsReponse>(`/api/v1/admin/reports?status=${status}`, signal),
    placeholderData: keepPreviousData,
  });
}

/** Cadeau (POST /admin/gifts) : répond le nombre de joueurs servis. */
export function useCadeau() {
  return useMutation({
    mutationFn: (corps: CadeauCorps) => envoyerJson<CadeauReponse>('/api/v1/admin/gifts', 'POST', corps),
  });
}

/** Copies de la base sur le serveur (GET /admin/backups), les plus récentes d'abord. */
export function useSauvegardes() {
  return useQuery({
    queryKey: ['admin', 'sauvegardes'],
    queryFn: ({ signal }) => lireJson<ListeSauvegardesReponse>('/api/v1/admin/backups', signal),
  });
}

/** « Sauvegarder maintenant » (POST /admin/backups, admins). */
export function useSauvegarder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => envoyerJson<SauvegardeReponse>('/api/v1/admin/backups', 'POST'),
    onSettled: () => client.invalidateQueries({ queryKey: ['admin', 'sauvegardes'] }),
  });
}
