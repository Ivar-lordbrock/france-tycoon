import {
  ANCIENNETE_ATTAQUANT_S,
  type CodeErreur,
  cibleTropPetite,
  DELAI_APRES_ECHEC_OPA_S,
  type MontantsOpa,
  montantsOpa,
  OPA_RECUES_MAX,
  opaSortantesMax,
  valeurTerritoire,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerLecteurPatrimoine } from './patrimoine.ts';

// Conditions pour lancer une OPA (docs/05, 5.5). Les mêmes règles servent au devis, à la fiche
// de la commune (actions possibles) et au lancement.

/** Une raison de refuser l'OPA, avec le message montré au joueur. */
export interface Refus {
  code: CodeErreur;
  statut: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface FaitsOpa {
  maintenant: number;
  attaquantId: number;
  commune: { ownerId: number | null; estCapitale: boolean; bouclierJusqua: number | null; opaEnCours: boolean };
  attaquant: {
    cash: number;
    creeLe: number;
    rang: number;
    maxTerritoires: number;
    /** Territoires possédés + OPA sortantes en cours (une place réservée chacune). */
    occupes: number;
    opaSortantes: number;
    patrimoine: number;
  };
  /** `null` si la commune est libre. */
  defenseur: { protectionJusqua: number; opaRecues: number; patrimoine: number } | null;
  /** Fin de la dernière OPA ratée (défendue ou retirée) de cet attaquant contre ce défenseur. */
  dernierEchec: number | null;
  offre: number;
}

const nombre = new Intl.NumberFormat('fr-FR');

/** Ce qui empêche l'OPA (vide : elle est possible), dans l'ordre où le joueur doit le lire. */
export function raisonsOpa(f: FaitsOpa): Refus[] {
  const { commune, attaquant, defenseur, maintenant } = f;
  if (commune.ownerId === f.attaquantId) {
    return [{ code: 'FORBIDDEN', statut: 403, message: 'Cette commune est déjà à toi.' }];
  }
  if (commune.ownerId === null || defenseur === null) {
    return [{ code: 'FORBIDDEN', statut: 403, message: 'Cette commune n’a pas de propriétaire : achète-la plutôt.' }];
  }

  const refus: Refus[] = [];
  const non = (code: CodeErreur, message: string, details?: Record<string, unknown>) =>
    refus.push({ code, statut: 409, message, ...(details ? { details } : {}) });

  if (commune.estCapitale) non('CAPITAL_IMMUNE', 'Une capitale ne peut pas être visée par une OPA.');
  if (commune.bouclierJusqua !== null && commune.bouclierJusqua > maintenant) {
    non('SHIELD_ACTIVE', 'Cette commune est protégée par un bouclier.', { shieldUntil: commune.bouclierJusqua });
  }
  if (defenseur.protectionJusqua > maintenant) {
    non('NEWBIE_PROTECTION', 'Ce joueur vient d’arriver : il est protégé pendant 72 h.', {
      until: defenseur.protectionJusqua,
    });
  }
  const assezAncien = attaquant.creeLe + ANCIENNETE_ATTAQUANT_S;
  if (assezAncien > maintenant) {
    non('NEWBIE_PROTECTION', 'Ton compte doit avoir 7 jours pour lancer une OPA.', { until: assezAncien });
  }
  if (commune.opaEnCours) non('TAKEOVER_ALREADY_PENDING', 'Une OPA est déjà en cours sur cette commune.');
  const max = opaSortantesMax(attaquant.rang);
  if (attaquant.opaSortantes >= max) {
    non(
      'TAKEOVER_LIMIT',
      max === 1
        ? 'Tu mènes déjà une OPA : attends qu’elle se termine.'
        : `Tu mènes déjà ${max} OPA : attends qu’une se termine.`,
    );
  }
  if (defenseur.opaRecues >= OPA_RECUES_MAX) non('TAKEOVER_LIMIT', `Ce joueur subit déjà ${OPA_RECUES_MAX} OPA.`);
  if (f.dernierEchec !== null && f.dernierEchec + DELAI_APRES_ECHEC_OPA_S > maintenant) {
    non('TAKEOVER_COOLDOWN', 'Ta dernière OPA contre ce joueur a échoué il y a moins de 7 jours.', {
      nextAt: f.dernierEchec + DELAI_APRES_ECHEC_OPA_S,
    });
  }
  if (cibleTropPetite(defenseur.patrimoine, attaquant.patrimoine)) {
    non('TARGET_TOO_SMALL', 'Ce joueur est trop petit pour toi : son patrimoine fait moins de 25 % du tien.');
  }
  if (attaquant.occupes >= attaquant.maxTerritoires) {
    non(
      'TERRITORY_LIMIT_REACHED',
      `Tu as déjà ${attaquant.occupes} territoires sur ${attaquant.maxTerritoires} (OPA en cours comprises).`,
    );
  }
  if (attaquant.cash < f.offre) {
    const manque = f.offre - attaquant.cash;
    non('INSUFFICIENT_FUNDS', `Il manque ${nombre.format(manque)} ₮`, { missing: manque, currency: 'cash' });
  }
  return refus;
}

/** Les codes des refus, sans doublon (deux `TAKEOVER_LIMIT` n'en font qu'un). */
export const codesRefus = (refus: readonly Refus[]): CodeErreur[] => [...new Set(refus.map((r) => r.code))];

/** Ce qu'il faut savoir d'une commune pour évaluer une OPA. */
export interface CommuneOpa {
  id: number;
  ownerId: number | null;
  isCapital: number;
  shieldUntil: number | null;
  baseValue: number;
  fortification: number;
  /** B : cash investi dans ses bâtiments. */
  investi: number;
}

export interface EvaluationOpa {
  /** V_T aujourd'hui (figée au lancement). */
  valeur: number;
  montants: MontantsOpa;
  refus: Refus[];
}

/** Lit les faits en base et applique `raisonsOpa` ; requêtes préparées une fois. */
export function creerEvaluationOpa(db: Base) {
  const attaquant = db.prepare<
    [number],
    { cash: number; creeLe: number; rang: number; maxTerritoires: number; possedes: number; opaSortantes: number }
  >(`
    SELECT u.cash, u.created_at AS creeLe, u.rank_level AS rang, u.max_territories AS maxTerritoires,
      (SELECT count(*) FROM territories WHERE owner_id = u.id) AS possedes,
      (SELECT count(*) FROM takeovers WHERE attacker_id = u.id AND status = 'pending') AS opaSortantes
    FROM users AS u WHERE u.id = ?`);
  const defenseur = db.prepare<[number], { protectionJusqua: number; opaRecues: number }>(`
    SELECT u.newbie_shield_until AS protectionJusqua,
      (SELECT count(*) FROM takeovers WHERE defender_id = u.id AND status = 'pending') AS opaRecues
    FROM users AS u WHERE u.id = ?`);
  const dernierEchec = db
    .prepare<[number, number], number | null>(`
      SELECT max(resolved_at) FROM takeovers
      WHERE attacker_id = ? AND defender_id = ? AND status IN ('defended', 'cancelled')`)
    .pluck();
  const opaEnCours = db
    .prepare<[number], number>("SELECT 1 FROM takeovers WHERE territory_id = ? AND status = 'pending'")
    .pluck();
  const lirePatrimoine = creerLecteurPatrimoine(db);

  return function evaluer(moi: number, c: CommuneOpa, maintenant: number): EvaluationOpa {
    const valeur = valeurTerritoire(c.baseValue, c.investi, c.fortification);
    const montants = montantsOpa(valeur);
    const a = attaquant.get(moi);
    if (!a) throw new Error(`Joueur inconnu : ${moi}`);
    const d = c.ownerId !== null && c.ownerId !== moi ? defenseur.get(c.ownerId) : undefined;
    const refus = raisonsOpa({
      maintenant,
      attaquantId: moi,
      commune: {
        ownerId: c.ownerId,
        estCapitale: c.isCapital === 1,
        bouclierJusqua: c.shieldUntil,
        opaEnCours: opaEnCours.get(c.id) !== undefined,
      },
      attaquant: {
        cash: a.cash,
        creeLe: a.creeLe,
        rang: a.rang,
        maxTerritoires: a.maxTerritoires,
        occupes: a.possedes + a.opaSortantes,
        opaSortantes: a.opaSortantes,
        patrimoine: lirePatrimoine(moi),
      },
      defenseur:
        d && c.ownerId !== null
          ? { protectionJusqua: d.protectionJusqua, opaRecues: d.opaRecues, patrimoine: lirePatrimoine(c.ownerId) }
          : null,
      dernierEchec: c.ownerId !== null ? (dernierEchec.get(moi, c.ownerId) ?? null) : null,
      offre: montants.offre,
    });
    return { valeur, montants, refus };
  };
}
