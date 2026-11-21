import { DIFFICULTES_QUETE, type DifficulteQuete, type EvenementQuete } from '@france-tycoon/shared';

// Tirage des 3 quêtes du jour (docs/05-equilibrage.md, 5.7) : 1 facile, 1 moyenne, 1 difficile,
// au hasard pondéré, parmi celles dont le joueur a assez de territoires. Même graine → même tirage.

/** Une ligne de `daily_quests`, ce qu'il faut pour tirer et figer la récompense. */
export interface ModeleQuete {
  id: number;
  code: string;
  eventType: EvenementQuete;
  difficulty: DifficulteQuete;
  targetMin: number;
  targetMax: number;
  weight: number;
  minTerritories: number;
  rewardIncomeHours: number;
  rewardCashMin: number;
  rewardGems: number;
}

export interface QueteTiree {
  modele: ModeleQuete;
  /** 1, 2 ou 3 : la place dans la liste du jour. */
  slot: number;
  /** Objectif tiré entre `targetMin` et `targetMax`. */
  target: number;
}

/**
 * Suite de nombres entre 0 et 1, toujours la même pour une même graine
 * (hachage FNV-1a du texte, puis générateur mulberry32).
 */
export function generateur(graine: string): () => number {
  let h = 0x811c9dc5;
  for (const lettre of graine) {
    h ^= lettre.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  let etat = h >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Une quête au hasard, chacune avec une chance proportionnelle à son poids. */
function tirerPondere(candidates: readonly ModeleQuete[], hasard: () => number): ModeleQuete | undefined {
  const total = candidates.reduce((somme, q) => somme + q.weight, 0);
  let reste = hasard() * total;
  for (const q of candidates) {
    reste -= q.weight;
    if (reste < 0) return q;
  }
  return candidates.at(-1);
}

/**
 * Les quêtes du jour d'un joueur. S'il n'y a aucune quête possible pour une difficulté (un joueur
 * sans commune n'a aucune quête moyenne), on tire une autre quête facile à la place.
 * `graine` = `<id du joueur>:<jour de Paris>`.
 */
export function tirerQuetes(catalogue: readonly ModeleQuete[], territoires: number, graine: string): QueteTiree[] {
  const hasard = generateur(graine);
  const possibles = catalogue.filter((q) => q.minTerritories <= territoires);
  const tirees: QueteTiree[] = [];
  for (const difficulte of DIFFICULTES_QUETE) {
    const libres = (d: DifficulteQuete) =>
      possibles.filter((q) => q.difficulty === d && !tirees.some((t) => t.modele.id === q.id));
    const candidates = libres(difficulte).length > 0 ? libres(difficulte) : libres('facile');
    const modele = tirerPondere(candidates, hasard);
    if (!modele) continue;
    const target = modele.targetMin + Math.floor(hasard() * (modele.targetMax - modele.targetMin + 1));
    tirees.push({ modele, slot: tirees.length + 1, target });
  }
  return tirees;
}
