import { create } from 'zustand';
import type { OngletFiche } from './carte.ts';

/** `alerte` : il faut réagir (OPA reçue) ; `erreur` : quelque chose a échoué. */
export type TonToast = 'info' | 'alerte' | 'erreur';

/** Petit message affiché quelques secondes par-dessus la carte. */
export interface Toast {
  id: number;
  texte: string;
  ton: TonToast;
  /** Un bouton (`libelle`) amène sur cette commune. */
  commune?: { insee: string; onglet?: OngletFiche };
  libelle?: string;
}
export type NouveauToast = Omit<Toast, 'id'>;

/** Pas plus de 3 à la fois : le plus ancien laisse sa place. */
export const TOASTS_MAX = 3;

/** Temps d'affichage, en ms (mis en pause tant que la souris ou le clavier est dessus). */
export const DUREE_TOAST: Record<TonToast, number> = { info: 6_000, alerte: 12_000, erreur: 8_000 };

interface EtatToasts {
  toasts: Toast[];
  ajouter: (toast: NouveauToast) => void;
  retirer: (id: number) => void;
}

let suivant = 1;

export const useToasts = create<EtatToasts>((set) => ({
  toasts: [],
  // Le même texte déjà affiché n'est pas répété (une erreur réseau qui revient toutes les minutes).
  ajouter: (toast) =>
    set(({ toasts }) =>
      toasts.some((t) => t.texte === toast.texte)
        ? { toasts }
        : { toasts: [...toasts, { ...toast, id: suivant++ }].slice(-TOASTS_MAX) },
    ),
  retirer: (id) => set(({ toasts }) => ({ toasts: toasts.filter((t) => t.id !== id) })),
}));

/** Ajouter un petit message depuis n'importe où (requêtes, flux en direct). */
export const ajouterToast = (toast: NouveauToast) => useToasts.getState().ajouter(toast);
