import type {
  AnnulationReponse,
  CatalogueBatiments,
  ChantierReponse,
  DemolitionReponse,
  FileConstruction,
  LireNotificationsReponse,
  MoiReponse,
} from '@france-tycoon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMaintenantMs } from '../etat/horloge.ts';
import { cashEnDirect, prochaineRelecture } from '../panels/batiments-texte.ts';
import { envoyerJson, lireJson } from './client.ts';
import { useMoi } from './compte.ts';
import { apresRefus, poserPortefeuille } from './territoires.ts';

/** Clé de la file de construction : sous `moi`, elle se relit avec le profil. */
export const CLE_FILE = ['moi', 'file'] as const;

/** Les types de bâtiments (public, change rarement). */
export function useCatalogue() {
  return useQuery({
    queryKey: ['batiments', 'catalogue'],
    queryFn: ({ signal }) => lireJson<CatalogueBatiments>('/api/v1/building-types', signal),
    staleTime: 3_600_000,
    select: (catalogue) => catalogue.buildingTypes,
  });
}

/** Mes chantiers en cours ; relus juste après la fin du prochain (le serveur le termine à ce moment-là). */
export function useFileChantiers(actif: boolean) {
  return useQuery({
    queryKey: CLE_FILE,
    queryFn: ({ signal }) => lireJson<FileConstruction>('/api/v1/me/construction-queue', signal),
    enabled: actif,
    staleTime: 15_000,
    refetchInterval: (query) => prochaineRelecture(query.state.data, Date.now()),
  });
}

/** Mon cash tel qu'il monte à l'écran entre deux lectures de /me (le serveur reste la référence). */
export function useCashEnDirect(): number | null {
  const { data: moi, dataUpdatedAt } = useMoi();
  const maintenant = useMaintenantMs(1_000);
  return moi ? cashEnDirect(moi.wallet.cash, moi.incomePerHour, maintenant - dataUpdatedAt) : null;
}

export type ActionBatiment =
  | { action: 'construire'; insee: string; typeCode: string; cle: string }
  | { action: 'ameliorer' | 'annuler'; insee: string; id: number; cle: string }
  | { action: 'demolir'; insee: string; id: number };

export type ReponseBatiment = ChantierReponse | AnnulationReponse | DemolitionReponse;

function envoyer(a: ActionBatiment): Promise<ReponseBatiment> {
  switch (a.action) {
    case 'construire':
      return envoyerJson(`/api/v1/territories/${a.insee}/buildings`, 'POST', { typeCode: a.typeCode }, { cle: a.cle });
    case 'ameliorer':
      return envoyerJson(`/api/v1/buildings/${a.id}/upgrade`, 'POST', undefined, { cle: a.cle });
    case 'annuler':
      return envoyerJson(`/api/v1/buildings/${a.id}/cancel`, 'POST', undefined, { cle: a.cle });
    case 'demolir':
      return envoyerJson(`/api/v1/buildings/${a.id}`, 'DELETE');
  }
}

/**
 * Construire, améliorer, annuler, démolir. Une clé `Idempotency-Key` par confirmation (sauf démolir).
 * Après coup : cash tout de suite, puis fiche, profil, file et « Mes territoires » relus.
 */
export function useActionBatiment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: envoyer,
    onSuccess: ({ wallet }, { insee }) => {
      poserPortefeuille(client, wallet);
      return Promise.all([
        client.invalidateQueries({ queryKey: ['fiche', insee] }),
        client.invalidateQueries({ queryKey: ['moi'] }),
      ]);
    },
    // Refus : la fiche et /me (file et « Mes territoires » compris) sont relus.
    onError: (_erreur, { insee }) => apresRefus(client, insee),
  });
}

/** Résumé au retour : marquer les chantiers finis comme vus. */
export function useMarquerVus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      envoyerJson<LireNotificationsReponse>('/api/v1/me/notifications/read', 'POST', { ids }),
    onSuccess: ({ unreadNotifications }, ids) =>
      client.setQueryData<MoiReponse | null>(['moi'], (moi) =>
        moi
          ? {
              ...moi,
              unreadNotifications,
              finishedWorks: moi.finishedWorks.filter((f) => !ids.includes(f.notificationId)),
            }
          : moi,
      ),
  });
}
