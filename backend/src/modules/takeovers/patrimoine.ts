import { patrimoine, valeurTerritoire } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

/**
 * Patrimoine d'un joueur, calculé à la demande (docs/05, 5.4) : cash + valeur de ses territoires
 * + offres bloquées dans ses OPA en cours. `users.net_worth` (cache du classement) arrive à l'étape 5.
 */
export function creerLecteurPatrimoine(db: Base) {
  const cash = db.prepare<[number], number>('SELECT cash FROM users WHERE id = ?').pluck();
  const territoires = db.prepare<[number], { v0: number; investi: number; fortification: number }>(`
    SELECT t.base_value AS v0, t.fortification_value AS fortification,
      coalesce((SELECT sum(invested_cash) FROM buildings WHERE territory_id = t.id), 0) AS investi
    FROM territories AS t WHERE t.owner_id = ?`);
  const sequestres = db
    .prepare<[number], number>("SELECT offer_amount FROM takeovers WHERE attacker_id = ? AND status = 'pending'")
    .pluck();

  return function lirePatrimoine(userId: number): number {
    const valeurs = territoires.all(userId).map((t) => valeurTerritoire(t.v0, t.investi, t.fortification));
    return patrimoine(cash.get(userId) ?? 0, valeurs, sequestres.all(userId));
  };
}
