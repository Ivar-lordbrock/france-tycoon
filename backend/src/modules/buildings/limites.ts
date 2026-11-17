import { maxTerritoires } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

/**
 * Recalcule `users.max_territories` (docs/05, 5.4) : 4 + territoires apportés par les bâtiments
 * (le siège social : +1 par niveau, `territory_slot_bonus`) + bonus de rang + emplacement acheté, 12 au plus.
 * À appeler dans la transaction qui change le niveau d'un bâtiment.
 */
export function creerRecalculLimite(db: Base) {
  const lire = db.prepare<[number], { bonus: number; rang: number; achete: number }>(`
    SELECT u.rank_level AS rang, u.extra_territory_slots AS achete,
      coalesce((
        SELECT sum(bt.territory_slot_bonus * b.level)
        FROM buildings AS b
        JOIN territories AS t ON t.id = b.territory_id
        JOIN building_types AS bt ON bt.id = b.building_type_id
        WHERE t.owner_id = u.id
      ), 0) AS bonus
    FROM users AS u WHERE u.id = ?`);
  const ecrire = db.prepare<[number, number]>('UPDATE users SET max_territories = ? WHERE id = ?');

  return function recalculerLimite(userId: number): number {
    const l = lire.get(userId);
    if (!l) throw new Error(`Joueur inconnu : ${userId}`);
    const max = maxTerritoires(l.bonus, l.rang, l.achete);
    ecrire.run(max, userId);
    return max;
  };
}
