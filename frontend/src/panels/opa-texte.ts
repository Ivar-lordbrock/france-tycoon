import {
  ANCIENNETE_ATTAQUANT_S,
  BOUCLIER_DEFENSE_S,
  BOUCLIER_OPA_REUSSIE_S,
  type CodeErreur,
  type DevisOpa,
  type FicheCommune,
  type MoiReponse,
  OPA_RECUES_MAX,
  type Opa,
} from '@france-tycoon/shared';
import { tycoons } from './fiche-texte.ts';
import { duree } from './territoires-texte.ts';

// Textes des OPA (docs/05, 5.5). Les montants viennent du serveur (devis ou OPA figée) : rien n'est recalculé ici.

/** Ce qu'on sait au moment d'expliquer pourquoi une OPA n'est pas possible. */
export interface ContexteOpa {
  fiche: Pick<FicheCommune, 'shieldUntil' | 'owner'>;
  moi: Pick<MoiReponse, 'user' | 'wallet' | 'territories'> | null;
  /** L'offre qui serait bloquée. */
  offre: number;
  /** OPA que je mène déjà. */
  mesOpaLancees: number;
  maintenant: number;
}

/** Pourquoi on ne peut pas lancer d'OPA, en clair ; `null` quand il n'y a rien à dire (commune libre ou à moi). */
export function raisonOpa(code: CodeErreur, c: ContexteOpa): string | null {
  const pseudo = c.fiche.owner?.pseudo ?? 'Ce joueur';
  switch (code) {
    case 'FORBIDDEN':
      return null;
    case 'UNAUTHENTICATED':
      return 'Connecte-toi pour lancer une OPA.';
    case 'CAPITAL_IMMUNE':
      return `C’est la capitale de ${pseudo} : une capitale ne peut pas être visée par une OPA.`;
    case 'SHIELD_ACTIVE':
      return c.fiche.shieldUntil
        ? `Protégée par un bouclier encore ${duree(c.fiche.shieldUntil - c.maintenant)}.`
        : 'Protégée par un bouclier.';
    case 'NEWBIE_PROTECTION': {
      const assezAncien = (c.moi?.user.createdAt ?? 0) + ANCIENNETE_ATTAQUANT_S;
      return assezAncien > c.maintenant
        ? `Ton compte doit avoir 7 jours pour lancer une OPA : encore ${duree(assezAncien - c.maintenant)}.`
        : `${pseudo} vient d’arriver : les nouveaux joueurs sont protégés pendant 3 jours.`;
    }
    case 'TAKEOVER_ALREADY_PENDING':
      return 'Une OPA est déjà en cours sur cette commune.';
    case 'TAKEOVER_LIMIT':
      return c.mesOpaLancees > 0
        ? 'Tu mènes déjà une OPA : attends qu’elle soit terminée.'
        : `${pseudo} subit déjà ${OPA_RECUES_MAX} OPA.`;
    case 'TAKEOVER_COOLDOWN':
      return `Ta dernière OPA contre ${pseudo} a échoué il y a moins de 7 jours.`;
    case 'TARGET_TOO_SMALL':
      return `Le patrimoine de ${pseudo} fait moins du quart du tien : vise un joueur de ta taille.`;
    case 'TERRITORY_LIMIT_REACHED':
      return c.moi
        ? `Tu as déjà ${c.moi.territories.owned} territoires sur ${c.moi.territories.max}.`
        : 'Limite de territoires atteinte.';
    case 'INSUFFICIENT_FUNDS': {
      const manque = c.offre - (c.moi?.wallet.cash ?? 0);
      return manque > 0 ? `Il te manque ${tycoons(manque)} pour l’offre (${tycoons(c.offre)}).` : 'Pas assez de cash.';
    }
    default:
      return 'OPA impossible pour le moment.';
  }
}

/** Le temps qu'il reste pour réagir : « 23 h 12 », « 8 min », « quelques secondes ». */
export function tempsRestant(finAt: number, maintenant: number): string {
  const reste = finAt - maintenant;
  // À la minute inférieure : 23 h 59 min 40 s restantes, c'est « 23 h 59 », pas « 1 j ».
  return reste < 60 ? 'quelques secondes' : duree(Math.floor(reste / 60) * 60);
}

type Ligne = [string, string];

/** Confirmation du lancement : ce que coûte l'OPA, et ce qui se passe selon la réponse. */
export function confirmationLancement(devis: DevisOpa, cash: number, proprietaire: string) {
  return {
    lignes: [
      ['Offre, bloquée 24 h', tycoons(devis.offerAmount)],
      ['Il te restera', tycoons(cash - devis.offerAmount)],
      ['Valeur de la commune', tycoons(devis.territoryValue)],
    ] satisfies Ligne[],
    note: `${proprietaire} a 24 h pour réagir. Offre acceptée ou sans réponse : la commune est à toi, avec ses bâtiments (bouclier de ${duree(BOUCLIER_OPA_REUSSIE_S)}). Défense payée : tu récupères ton offre moins ${tycoons(devis.breakFee)} d’indemnité.`,
  };
}

/** Confirmation de la défense (défenseur). */
export function confirmationDefense(opa: Opa, cash: number) {
  return {
    lignes: [
      ['Coût de la défense', tycoons(opa.defenseCost)],
      ['Il te restera', tycoons(cash - opa.defenseCost)],
      ['Indemnité reçue', `+${tycoons(opa.breakFee)}`],
      ['Valeur de la commune', `+${tycoons(opa.defenseCost)}`],
    ] satisfies Ligne[],
    note: `Tu gardes ${opa.territory.name}, avec un bouclier de ${duree(BOUCLIER_DEFENSE_S)}. ${opa.attacker.pseudo} récupère son offre moins l’indemnité.`,
  };
}

/** Confirmation de la vente à l'attaquant (défenseur). */
export function confirmationAcceptation(opa: Opa, revenuParHeure: number) {
  return {
    lignes: [
      ['Tu reçois', tycoons(opa.offerAmount)],
      ['Valeur de la commune', tycoons(opa.territoryValue)],
      ['Revenu perdu', `−${tycoons(revenuParHeure)}/h`],
    ] satisfies Ligne[],
    note: `${opa.territory.name} passe à ${opa.attacker.pseudo}, avec ses bâtiments et ses chantiers en cours.`,
  };
}

/** Confirmation du retrait de l'offre (attaquant). */
export function confirmationRetrait(opa: Opa) {
  return {
    lignes: [
      ['Tu récupères', tycoons(opa.offerAmount - opa.breakFee)],
      ['Indemnité perdue', tycoons(opa.breakFee)],
    ] satisfies Ligne[],
    note: `${opa.defender.pseudo} garde ${opa.territory.name} et reçoit l’indemnité.`,
  };
}

/** Le message après une action réussie. */
export function messageApres(opa: Opa): string {
  const commune = opa.territory.name;
  switch (opa.status) {
    case 'pending':
      return `OPA lancée sur ${commune}. ${opa.defender.pseudo} a 24 h pour réagir.`;
    case 'defended':
      return `${commune} est défendue : bouclier de ${duree(BOUCLIER_DEFENSE_S)} et ${tycoons(opa.breakFee)} d’indemnité pour toi.`;
    case 'accepted':
      return `${commune} est vendue à ${opa.attacker.pseudo} pour ${tycoons(opa.offerAmount)}.`;
    case 'cancelled':
      return `Offre retirée : ${tycoons(opa.offerAmount - opa.breakFee)} te sont rendus.`;
    case 'succeeded':
      return opa.role === 'attacker' ? `${commune} est à toi !` : `${commune} est passée à ${opa.attacker.pseudo}.`;
    case 'voided':
      return `OPA annulée : ${tycoons(opa.offerAmount)} rendus à ${opa.attacker.pseudo}.`;
  }
}

/** Une OPA en cours, en une phrase, selon mon rôle (bandeau « Mes OPA »). */
export function phraseOpaEnCours(opa: Opa, maintenant: number): string {
  const reste = tempsRestant(opa.expiresAt, maintenant);
  return opa.role === 'defender'
    ? `${opa.attacker.pseudo} offre ${tycoons(opa.offerAmount)}. Il te reste ${reste} pour réagir.`
    : `Ton offre : ${tycoons(opa.offerAmount)}. ${opa.defender.pseudo} a encore ${reste} pour réagir.`;
}
