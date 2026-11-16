import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';

export type Devise = 'cash' | 'gems';

/** Liste fermée de `wallet_transactions.reason` (001_initial.sql). */
export type RaisonMouvement =
  | 'signup_bonus'
  | 'income_collect'
  | 'territory_purchase'
  | 'territory_sale'
  | 'building_construction'
  | 'building_upgrade'
  | 'building_demolition_refund'
  | 'takeover_escrow'
  | 'takeover_refund'
  | 'takeover_payout'
  | 'takeover_break_fee'
  | 'takeover_defense'
  | 'inactivity_buyback'
  | 'quest_reward'
  | 'tutorial_reward'
  | 'shop_purchase'
  | 'gems_purchase'
  | 'gems_refund'
  | 'admin_adjustment';

export interface Mouvement {
  userId: number;
  currency: Devise;
  /** Entier signé : positif = crédit, négatif = débit. */
  amount: number;
  reason: RaisonMouvement;
  /** Objet concerné (territoire, bâtiment, OPA…). */
  ref?: { type: string; id: number };
  /** Rejouer la même clé ne paie pas deux fois : on renvoie le premier résultat. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ResultatMouvement {
  transactionId: number;
  /** Solde après le mouvement. */
  balance: number;
  /** Vrai si la clé d'idempotence avait déjà servi : rien n'a bougé cette fois. */
  replayed: boolean;
}

interface LigneJournal {
  id: number;
  user_id: number;
  currency: Devise;
  amount: number;
  reason: string;
  balance_after: number;
}

const COLONNE: Record<Devise, 'cash' | 'premium_currency'> = { cash: 'cash', gems: 'premium_currency' };
const nombre = new Intl.NumberFormat('fr-FR');
const montant = (n: number, devise: Devise) => `${nombre.format(n)} ${devise === 'cash' ? '₮' : '💎'}`;

/**
 * La seule fonction qui modifie un solde (`users.cash` ou `users.premium_currency`).
 * Met à jour le solde et écrit le journal `wallet_transactions` ; doit tourner dans
 * la transaction de l'action qui paie (`db.transaction(...).immediate()`).
 */
function apply(db: Base, mouvement: Mouvement): ResultatMouvement {
  const { userId, currency, amount, reason, ref, idempotencyKey, metadata } = mouvement;
  if (!db.inTransaction) throw new Error('wallet.apply doit être appelé dans une transaction');
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error(`Montant invalide : ${amount}`);

  if (idempotencyKey !== undefined) {
    const deja = db
      .prepare<[string], LigneJournal>(
        'SELECT id, user_id, currency, amount, reason, balance_after FROM wallet_transactions WHERE idempotency_key = ?',
      )
      .get(idempotencyKey);
    if (deja) {
      if (deja.user_id !== userId || deja.currency !== currency || deja.amount !== amount || deja.reason !== reason) {
        throw new Error(`Clé d'idempotence déjà utilisée pour un autre mouvement : ${idempotencyKey}`);
      }
      return { transactionId: deja.id, balance: deja.balance_after, replayed: true };
    }
  }

  const colonne = COLONNE[currency];
  const solde = db.prepare<[number], number>(`SELECT ${colonne} FROM users WHERE id = ?`).pluck().get(userId);
  if (solde === undefined) throw new Error(`Joueur inconnu : ${userId}`);

  const apres = solde + amount;
  if (apres < 0) {
    throw new ErreurMetier('INSUFFICIENT_FUNDS', 409, `Il manque ${montant(-apres, currency)}`, {
      missing: -apres,
      currency,
    });
  }

  db.prepare(`UPDATE users SET ${colonne} = ?, updated_at = unixepoch() WHERE id = ?`).run(apres, userId);
  const transactionId = db
    .prepare<unknown[], number>(`
      INSERT INTO wallet_transactions
        (user_id, currency, amount, balance_after, reason, ref_type, ref_id, idempotency_key, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id`)
    .pluck()
    .get(
      userId,
      currency,
      amount,
      apres,
      reason,
      ref?.type ?? null,
      ref?.id ?? null,
      idempotencyKey ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ) as number;

  return { transactionId, balance: apres, replayed: false };
}

export const wallet = { apply };
