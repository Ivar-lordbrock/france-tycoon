import {
  BOUCLIER_ACHAT_S,
  type CodeErreur,
  type FicheCommune,
  type MoiReponse,
  type MonTerritoire,
  prixVenteEtat,
} from '@france-tycoon/shared';
import { tycoons } from './fiche-texte.ts';

// Textes et aperçus de l'achat, de la vente et de « Mes territoires ».
// Ce ne sont que des aperçus : le serveur recalcule tout au moment de payer (CLAUDE.md).

/** Une durée lisible : « 45 s », « 12 min », « 2 h 40 », « 4 j 3 h ». */
export function duree(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const resteMin = minutes % 60;
  if (heures < 24) return resteMin === 0 ? `${heures} h` : `${heures} h ${String(resteMin).padStart(2, '0')}`;
  const jours = Math.floor(heures / 24);
  const resteH = heures % 24;
  return resteH === 0 ? `${jours} j` : `${jours} j ${resteH} h`;
}

export const estAMoi = (fiche: Pick<FicheCommune, 'owner'>) => fiche.owner?.isMe === true;

/** Pourquoi on ne peut pas vendre ; `null` quand il n'y a rien à dire (pas ma commune, pas connecté). */
export function raisonVente(code: CodeErreur): string | null {
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'FORBIDDEN':
      return null;
    case 'CAPITAL_IMMUNE':
      return 'C’est ta capitale : elle ne se vend pas.';
    case 'TAKEOVER_ALREADY_PENDING':
      return 'Une OPA est en cours sur cette commune : vente impossible pour le moment.';
    default:
      return 'Vente impossible pour le moment.';
  }
}

export interface ApercuAchat {
  prix: number;
  /** Cash qui restera après l'achat. */
  resteCash: number;
  revenuParHeure: number;
  /** Temps pour regagner le prix avec le seul revenu de la commune ; `null` si elle ne rapporte rien. */
  retour: number | null;
  bouclier: number;
  territoires: { apres: number; max: number };
}

export function apercuAchat(fiche: FicheCommune, moi: MoiReponse): ApercuAchat {
  const prix = fiche.actions.buyPrice ?? fiche.baseValue;
  return {
    prix,
    resteCash: moi.wallet.cash - prix,
    revenuParHeure: fiche.incomePerHour,
    retour: fiche.incomePerHour > 0 ? Math.ceil(prix / fiche.incomePerHour) * 3_600 : null,
    bouclier: BOUCLIER_ACHAT_S,
    territoires: { apres: moi.territories.owned + 1, max: moi.territories.max },
  };
}

export interface ApercuVente {
  montant: number;
  valeur: number;
  batiments: number;
  chantiers: number;
  revenuPerdu: number;
}

export function apercuVente(fiche: FicheCommune): ApercuVente {
  return {
    montant: fiche.actions.sellPrice ?? prixVenteEtat(fiche.totalValue),
    valeur: fiche.totalValue,
    batiments: fiche.buildings.length,
    chantiers: fiche.buildings.filter((b) => b.targetLevel !== null).length,
    revenuPerdu: fiche.incomePerHour,
  };
}

/** Ce que la vente détruit, en une phrase. */
export function pertesVente({ batiments, chantiers }: Pick<ApercuVente, 'batiments' | 'chantiers'>): string {
  if (batiments === 0) return 'Aucun bâtiment à perdre.';
  const liste = batiments === 1 ? 'Ton bâtiment sera détruit' : `Tes ${batiments} bâtiments seront détruits`;
  return chantiers > 0 ? `${liste}, chantier en cours compris.` : `${liste}.`;
}

/** Deuxième ligne d'une commune dans « Mes territoires ». */
export function detailsTerritoire(t: MonTerritoire, maintenant: number): string {
  const morceaux = [`Valeur ${tycoons(t.totalValue)}`, `${t.buildingSlots.used}/${t.buildingSlots.total} emplacements`];
  const chantier = t.works[0];
  if (chantier)
    morceaux.push(`${chantier.name} niv. ${chantier.targetLevel} dans ${duree(chantier.endsAt - maintenant)}`);
  if (t.shieldUntil !== null && t.shieldUntil > maintenant)
    morceaux.push(`bouclier ${duree(t.shieldUntil - maintenant)}`);
  return morceaux.join(' · ');
}
