import { type EvenementDirect, evenementDirectSchema, type MoiReponse } from '@france-tycoon/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ajouterToast } from '../etat/toasts.ts';
import { toastDirect } from '../panels/notifications-texte.ts';

/** Les événements du flux `/api/v1/events` (docs/04, « Notifications et temps réel »). */
const TYPES = evenementDirectSchema.options.map((option) => option.shape.type.value);

/** Ce qu'un événement change à l'écran : requêtes relues, solde posé, petit message. */
export function traiterEvenement(client: QueryClient, e: EvenementDirect) {
  switch (e.type) {
    case 'wallet.changed': {
      const { incomePerHour, ...wallet } = e.data;
      client.setQueryData<MoiReponse | null>(['moi'], (moi) => (moi ? { ...moi, wallet, incomePerHour } : moi));
      break;
    }
    case 'takeover.received':
    case 'takeover.resolved':
      // `moi` couvre aussi mes OPA en cours et le centre de notifications.
      void Promise.all([
        client.invalidateQueries({ queryKey: ['moi'] }),
        client.invalidateQueries({ queryKey: ['fiche', e.data.payload.territoryInsee] }),
        client.invalidateQueries({ queryKey: ['opa', e.data.payload.takeoverId] }),
        client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
      ]);
      break;
    case 'building.done':
      // `moi` : chantier en cours, revenu, résumé « Chantier terminé ».
      void Promise.all([
        client.invalidateQueries({ queryKey: ['moi'] }),
        client.invalidateQueries({ queryKey: ['fiche', e.data.payload.territoryInsee] }),
      ]);
      break;
    case 'quest.completed':
      // `moi` : le centre de notifications ; `quetes` : la liste du jour (paquet de l'écran à venir).
      void Promise.all([
        client.invalidateQueries({ queryKey: ['moi'] }),
        client.invalidateQueries({ queryKey: ['quetes'] }),
      ]);
      break;
  }
  const toast = toastDirect(e);
  if (toast) ajouterToast(toast);
}

/** Après une fermeture pour de bon (502 pendant un redémarrage, 401), on réessaie au bout de 10 s. */
const REESSAI_MS = 10_000;

/**
 * Écoute le flux en direct tant que le joueur est connecté. Le serveur ne rattrape rien :
 * à chaque reconnexion, on relit ce qui a pu changer. Le navigateur se reconnecte seul (5 s)
 * après une coupure réseau, mais abandonne après une réponse d'erreur : on rouvre alors nous-mêmes.
 */
export function useFluxDirect() {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let reessai: number | undefined;
    let dejaOuvert = false;

    const recevoir = (message: Event) => {
      if (!(message instanceof MessageEvent) || typeof message.data !== 'string') return;
      let data: unknown;
      try {
        data = JSON.parse(message.data);
      } catch {
        return;
      }
      const evenement = evenementDirectSchema.safeParse({ type: message.type, data });
      if (evenement.success) traiterEvenement(client, evenement.data);
    };

    const ouvrir = () => {
      const flux = new EventSource('/api/v1/events');
      source = flux;
      flux.onopen = () => {
        if (dejaOuvert) {
          void Promise.all([
            client.invalidateQueries({ queryKey: ['moi'] }),
            client.invalidateQueries({ queryKey: ['fiche'] }),
            client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
          ]);
        }
        dejaOuvert = true;
      };
      flux.onerror = () => {
        if (flux.readyState !== EventSource.CLOSED) return;
        // Session expirée ? /me le dira (déconnecté, ce composant disparaît et le réessai avec).
        void client.invalidateQueries({ queryKey: ['moi'] });
        reessai = window.setTimeout(ouvrir, REESSAI_MS);
      };
      for (const type of TYPES) flux.addEventListener(type, recevoir);
    };

    ouvrir();
    return () => {
      window.clearTimeout(reessai);
      source?.close();
    };
  }, [client]);
}
