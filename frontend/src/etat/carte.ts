import type { BoiteCarte } from '@france-tycoon/shared';
import type { Map as CarteLeaflet } from 'leaflet';
import { create } from 'zustand';
import type { CleVue } from '../map/vues.ts';

export interface Chargement {
  communes: number;
  enCours: boolean;
  tronque: boolean;
  erreur: boolean;
}

interface EtatCarte {
  /** Instance Leaflet, pour que les panneaux hors carte puissent la déplacer. */
  carte: CarteLeaflet | null;
  vueActive: CleVue;
  /** Commune mise en avant (choisie dans la recherche ou cliquée). */
  selection: string | null;
  vue: { zoom: number; bbox: BoiteCarte } | null;
  chargement: Chargement;
  definirCarte: (carte: CarteLeaflet | null) => void;
  definirVueActive: (vue: CleVue) => void;
  definirSelection: (insee: string | null) => void;
  definirVue: (vue: { zoom: number; bbox: BoiteCarte }) => void;
  definirChargement: (chargement: Chargement) => void;
}

export const useCarte = create<EtatCarte>()((set) => ({
  carte: null,
  vueActive: 'MET',
  selection: null,
  vue: null,
  chargement: { communes: 0, enCours: false, tronque: false, erreur: false },
  definirCarte: (carte) => set({ carte }),
  definirVueActive: (vueActive) => set({ vueActive }),
  definirSelection: (selection) => set({ selection }),
  definirVue: (vue) => set({ vue }),
  definirChargement: (chargement) => set({ chargement }),
}));
