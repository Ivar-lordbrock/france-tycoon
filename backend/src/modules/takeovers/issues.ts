import {
  BOUCLIER_DEFENSE_S,
  BOUCLIER_OPA_REUSSIE_S,
  type ContenuOpaTerminee,
  type RoleOpa,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerRecalculLimite } from '../buildings/limites.ts';
import { wallet } from '../wallet/wallet.ts';

// Les issues d'une OPA (docs/05, 5.5) : défendue, acceptée, réussie au bout de 24 h, retirée, annulée par le système.
// Chaque issue tourne dans la transaction de l'appelant, avec un statut `pending` vérifié avant.

/** Ce qu'il faut savoir d'une OPA pour la terminer. */
export interface OpaATerminer {
  id: number;
  territoryId: number;
  territoryInsee: string;
  territoryName: string;
  attackerId: number;
  defenderId: number;
  offerAmount: number;
  defenseCost: number;
  breakFee: number;
  status: string;
  expiresAt: number;
}

/** Encaisse les revenus d'un joueur jusqu'à `instant`, sans résoudre les OPA (voir `creerEncaisseur`). */
export type EncaisseurSimple = (moi: number, instant: number) => unknown;

const SELECT_OPA = `
  SELECT o.id, o.territory_id AS territoryId, t.insee_code AS territoryInsee, t.name AS territoryName,
    o.attacker_id AS attackerId, o.defender_id AS defenderId, o.offer_amount AS offerAmount,
    o.defense_cost AS defenseCost, o.break_fee AS breakFee, o.status, o.expires_at AS expiresAt
  FROM takeovers AS o JOIN territories AS t ON t.id = o.territory_id`;

export function creerIssuesOpa(db: Base, encaisserSimple: EncaisseurSimple) {
  const lire = db.prepare<[number], OpaATerminer>(`${SELECT_OPA} WHERE o.id = ?`);
  const premiereEchue = db
    .prepare<[number], number>("SELECT 1 FROM takeovers WHERE status = 'pending' AND expires_at <= ? LIMIT 1")
    .pluck();
  const echues = db.prepare<[number], OpaATerminer>(
    `${SELECT_OPA} WHERE o.status = 'pending' AND o.expires_at <= ? ORDER BY o.expires_at, o.id`,
  );
  const clore = db.prepare<[string, number, number]>(
    "UPDATE takeovers SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
  );
  const changerProprietaire = db.prepare<Record<string, number>>(`
    UPDATE territories SET owner_id = @attaquant, acquired_at = @instant, acquired_price = @prix, shield_until = @bouclier
    WHERE id = @territoire AND owner_id = @defenseur`);
  const fortifier = db.prepare<[number, number, number]>(
    'UPDATE territories SET fortification_value = fortification_value + ?, shield_until = ? WHERE id = ?',
  );
  const noterHistorique = db.prepare<[number, number, number, number, number, number]>(`
    INSERT INTO territory_ownership_history (territory_id, from_user_id, to_user_id, reason, price, takeover_id, created_at)
    VALUES (?, ?, ?, 'takeover', ?, ?, ?)`);
  const pseudo = db.prepare<[number], string>('SELECT pseudo FROM users WHERE id = ?').pluck();
  const notifier = db.prepare<[number, string, number]>(
    "INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, 'takeover_resolved', ?, ?)",
  );
  const recalculerLimite = creerRecalculLimite(db);

  function verifierTransaction(o: OpaATerminer) {
    if (!db.inTransaction) throw new Error('une issue d’OPA doit tourner dans une transaction');
    if (o.status !== 'pending') throw new Error(`OPA ${o.id} déjà terminée (${o.status})`);
  }

  /** Statut final, puis un message à chaque joueur de `aPrevenir`. */
  function terminer(o: OpaATerminer, status: ContenuOpaTerminee['status'], instant: number, aPrevenir: RoleOpa[]) {
    if (clore.run(status, instant, o.id).changes !== 1) throw new Error(`OPA ${o.id} : statut déjà changé`);
    for (const role of aPrevenir) {
      const moi = role === 'attacker' ? o.attackerId : o.defenderId;
      const autre = role === 'attacker' ? o.defenderId : o.attackerId;
      const contenu: ContenuOpaTerminee = {
        takeoverId: o.id,
        territoryInsee: o.territoryInsee,
        territoryName: o.territoryName,
        status,
        role,
        otherPseudo: pseudo.get(autre) ?? '',
      };
      notifier.run(moi, JSON.stringify(contenu), instant);
    }
  }

  const ref = (o: OpaATerminer) => ({ type: 'takeover', id: o.id });

  /**
   * Acceptée ou 24 h sans réponse : le défenseur reçoit l'offre (déjà prise à l'attaquant au lancement),
   * la commune passe à l'attaquant avec ses bâtiments et chantiers, bouclier 48 h.
   * Les deux joueurs encaissent d'abord jusqu'à `instant` : chacun touche les revenus de la commune pour son temps.
   */
  function transferer(o: OpaATerminer, status: 'accepted' | 'succeeded', instant: number) {
    verifierTransaction(o);
    encaisserSimple(o.defenderId, instant);
    encaisserSimple(o.attackerId, instant);
    wallet.apply(db, {
      userId: o.defenderId,
      currency: 'cash',
      amount: o.offerAmount,
      reason: 'takeover_payout',
      ref: ref(o),
    });
    const bouge = changerProprietaire.run({
      attaquant: o.attackerId,
      instant,
      prix: o.offerAmount,
      bouclier: instant + BOUCLIER_OPA_REUSSIE_S,
      territoire: o.territoryId,
      defenseur: o.defenderId,
    });
    if (bouge.changes !== 1) throw new Error(`OPA ${o.id} : la commune n’est plus au défenseur`);
    noterHistorique.run(o.territoryId, o.defenderId, o.attackerId, o.offerAmount, o.id, instant);
    // Un siège social sur la commune change la limite de territoires des deux joueurs.
    recalculerLimite(o.defenderId);
    recalculerLimite(o.attackerId);
    terminer(o, status, instant, status === 'accepted' ? ['attacker'] : ['attacker', 'defender']);
  }

  /**
   * Défendue : le défenseur paie D (sa commune vaut D de plus) et reçoit l'indemnité ;
   * l'attaquant récupère son offre moins l'indemnité. Bouclier 72 h.
   */
  function defendre(o: OpaATerminer, instant: number, cle?: string) {
    verifierTransaction(o);
    wallet.apply(db, {
      userId: o.defenderId,
      currency: 'cash',
      amount: -o.defenseCost,
      reason: 'takeover_defense',
      ref: ref(o),
      idempotencyKey: cle,
    });
    payerIndemnite(o);
    fortifier.run(o.defenseCost, instant + BOUCLIER_DEFENSE_S, o.territoryId);
    terminer(o, 'defended', instant, ['attacker']);
  }

  /** Retirée par l'attaquant : il récupère son offre moins l'indemnité, versée au défenseur. */
  function retirer(o: OpaATerminer, instant: number, cle?: string) {
    verifierTransaction(o);
    payerIndemnite(o, cle);
    terminer(o, 'cancelled', instant, ['defender']);
  }

  /**
   * Annulée par le système (défenseur libéré pour inactivité, compte banni) : l'attaquant récupère
   * toute son offre, rien pour le défenseur.
   */
  function annuler(o: OpaATerminer, instant: number) {
    verifierTransaction(o);
    wallet.apply(db, {
      userId: o.attackerId,
      currency: 'cash',
      amount: o.offerAmount,
      reason: 'takeover_refund',
      ref: ref(o),
    });
    terminer(o, 'voided', instant, ['attacker']);
  }

  /** Offre rendue à l'attaquant moins l'indemnité ; l'indemnité au défenseur. */
  function payerIndemnite(o: OpaATerminer, cleRemboursement?: string) {
    wallet.apply(db, {
      userId: o.attackerId,
      currency: 'cash',
      amount: o.offerAmount - o.breakFee,
      reason: 'takeover_refund',
      ref: ref(o),
      idempotencyKey: cleRemboursement,
    });
    if (o.breakFee > 0) {
      wallet.apply(db, {
        userId: o.defenderId,
        currency: 'cash',
        amount: o.breakFee,
        reason: 'takeover_break_fee',
        ref: ref(o),
      });
    }
  }

  /**
   * Toutes les OPA dont les 24 h sont passées, de la plus ancienne à la plus récente, passent à l'attaquant
   * (même fonction pour la tâche `resolve-takeovers` et pour la lecture). Idempotent ; ouvre sa propre
   * transaction si l'appelant n'en a pas. Renvoie le nombre d'OPA résolues.
   */
  function resoudreEchues(maintenant: number): number {
    if (premiereEchue.get(maintenant) === undefined) return 0; // cas courant : rien à faire, aucun verrou
    const resoudre = () => {
      const liste = echues.all(maintenant);
      for (const o of liste) transferer(o, 'succeeded', o.expiresAt);
      return liste.length;
    };
    return db.inTransaction ? resoudre() : db.transaction(resoudre).immediate();
  }

  return { lire: (id: number) => lire.get(id), transferer, defendre, retirer, annuler, resoudreEchues };
}
