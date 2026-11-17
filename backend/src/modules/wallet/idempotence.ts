import type { FastifyRequest } from 'fastify';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';

const FORMAT_CLE = /^[\w-]{8,100}$/;

/**
 * Clé d'idempotence d'une action qui coûte de l'argent (docs/04, en-tête `Idempotency-Key`).
 * Préfixée par l'action et le joueur : la même clé envoyée par deux joueurs ne se mélange pas.
 * `undefined` si le client n'en envoie pas.
 */
export function cleIdempotence(req: FastifyRequest, action: string, userId: number): string | undefined {
  const brute = req.headers['idempotency-key'];
  if (brute === undefined) return undefined;
  if (typeof brute !== 'string' || !FORMAT_CLE.test(brute)) {
    throw new ErreurMetier(
      'VALIDATION_ERROR',
      400,
      'En-tête Idempotency-Key invalide (8 à 100 lettres, chiffres, - ou _).',
    );
  }
  return `${action}:${userId}:${brute}`;
}

/** Le mouvement déjà payé avec cette clé (action rejouée), ou `undefined`. */
export function mouvementDejaFait(
  db: Base,
  cle: string | undefined,
): { amount: number; refId: number | null } | undefined {
  if (cle === undefined) return undefined;
  return db
    .prepare<[string], { amount: number; refId: number | null }>(
      'SELECT amount, ref_id AS refId FROM wallet_transactions WHERE idempotency_key = ?',
    )
    .get(cle);
}
