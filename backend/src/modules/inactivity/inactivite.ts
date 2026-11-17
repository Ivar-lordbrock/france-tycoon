import {
  AVERTISSEMENT_INACTIVITE_S,
  type ContenuAvertissementInactivite,
  type ContenuLiberationInactivite,
  LIBERATION_INACTIVITE_S,
  rachatInactivite,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerRecalculLimite } from '../buildings/limites.ts';
import { creerEncaisseur, creerEncaisseurSimple } from '../income/revenus.ts';
import { creerIssuesOpa } from '../takeovers/issues.ts';
import { wallet } from '../wallet/wallet.ts';

// Joueurs inactifs (docs/05, 5.6) : un message au bout de 11 jours sans activité, puis à 14 jours
// l'État rachète leurs territoires, qui redeviennent libres. Tâches `warn-inactive` et `release-inactive`.
// L'activité (`users.last_active_at`) est notée par la session, au plus toutes les 5 min.

interface TerritoireARacheter {
  id: number;
  baseValue: number;
  investi: number;
}

export function creerInactivite(db: Base) {
  // Avertis : actifs, absents depuis 11 jours, qui ont au moins un territoire, pas encore prévenus pour cette absence.
  const aAvertir = db.prepare<{ limite: number }, { id: number; lastActiveAt: number }>(`
    SELECT u.id, u.last_active_at AS lastActiveAt FROM users AS u
    WHERE u.status = 'active' AND u.last_active_at <= @limite
      AND EXISTS (SELECT 1 FROM territories WHERE owner_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = u.id AND kind = 'inactivity_warning' AND created_at >= u.last_active_at)
    ORDER BY u.id`);
  const aLiberer = db
    .prepare<{ limite: number }, number>(
      "SELECT id FROM users WHERE status = 'active' AND last_active_at <= @limite ORDER BY id",
    )
    .pluck();
  // Relu dans la transaction : le joueur a pu revenir entre la liste et son tour.
  const toujoursAbsent = db
    .prepare<[number, number], number>("SELECT 1 FROM users WHERE id = ? AND status = 'active' AND last_active_at <= ?")
    .pluck();
  const territoires = db.prepare<[number], TerritoireARacheter>(`
    SELECT t.id, t.base_value AS baseValue,
      coalesce((SELECT sum(invested_cash) FROM buildings WHERE territory_id = t.id), 0) AS investi
    FROM territories AS t WHERE t.owner_id = ? ORDER BY t.id`);
  const opaEnCours = db
    .prepare<[number, number], number>(
      "SELECT id FROM takeovers WHERE status = 'pending' AND (attacker_id = ? OR defender_id = ?) ORDER BY id",
    )
    .pluck();
  const detruireBatiments = db.prepare<[number]>('DELETE FROM buildings WHERE territory_id = ?');
  const liberer = db.prepare<[number, number]>(`
    UPDATE territories SET owner_id = NULL, acquired_at = NULL, acquired_price = NULL,
      shield_until = NULL, fortification_value = 0, is_capital = 0
    WHERE id = ? AND owner_id = ?`);
  const noterHistorique = db.prepare<[number, number, number, number]>(`
    INSERT INTO territory_ownership_history (territory_id, from_user_id, to_user_id, reason, price, created_at)
    VALUES (?, ?, NULL, 'inactivity_release', ?, ?)`);
  const endormir = db.prepare<[number]>("UPDATE users SET status = 'dormant', updated_at = unixepoch() WHERE id = ?");
  const notifier = db.prepare<[number, string, string, number]>(
    'INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, ?, ?, ?)',
  );
  const encaisser = creerEncaisseur(db);
  const issues = creerIssuesOpa(db, creerEncaisseurSimple(db));
  const recalculerLimite = creerRecalculLimite(db);

  /** `warn-inactive` : « tes territoires seront libérés dans 3 jours ». Renvoie le nombre de joueurs prévenus. */
  function avertir(maintenant: number): number {
    return db
      .transaction(() => {
        const liste = aAvertir.all({ limite: maintenant - AVERTISSEMENT_INACTIVITE_S });
        for (const u of liste) {
          const contenu: ContenuAvertissementInactivite = { releaseAt: u.lastActiveAt + LIBERATION_INACTIVITE_S };
          notifier.run(u.id, 'inactivity_warning', JSON.stringify(contenu), maintenant);
        }
        return liste.length;
      })
      .immediate();
  }

  /** Libère un joueur absent depuis 14 jours (une transaction). `false` s'il est revenu entre-temps. */
  function libererJoueur(userId: number, maintenant: number): boolean {
    return db
      .transaction((): boolean => {
        const limite = maintenant - LIBERATION_INACTIVITE_S;
        if (toujoursAbsent.get(userId, limite) === undefined) return false;

        // Ses revenus en attente d'abord (48 h au plus) : il garde son cash.
        encaisser(userId, maintenant);
        // Les OPA qui le visent (et les siennes, s'il en reste) sont annulées, l'offre rendue à l'attaquant.
        for (const id of opaEnCours.all(userId, userId)) {
          const o = issues.lire(id);
          if (o) issues.annuler(o, maintenant);
        }

        let total = 0;
        const liste = territoires.all(userId);
        for (const t of liste) {
          const montant = rachatInactivite(t.baseValue, t.investi);
          detruireBatiments.run(t.id);
          if (liberer.run(t.id, userId).changes !== 1) throw new Error(`Libération du territoire ${t.id} impossible`);
          noterHistorique.run(t.id, userId, montant, maintenant);
          if (montant > 0) {
            wallet.apply(db, {
              userId,
              currency: 'cash',
              amount: montant,
              reason: 'inactivity_buyback',
              ref: { type: 'territory', id: t.id },
            });
          }
          total += montant;
        }
        recalculerLimite(userId); // un siège social détruit rend ses territoires en plus
        endormir.run(userId);
        if (liste.length > 0) {
          const contenu: ContenuLiberationInactivite = { territories: liste.length, amount: total };
          notifier.run(userId, 'inactivity_released', JSON.stringify(contenu), maintenant);
        }
        return true;
      })
      .immediate();
  }

  /** `release-inactive` : tous les joueurs absents depuis 14 jours. Renvoie le nombre de joueurs libérés. */
  function libererAbsents(maintenant: number): number {
    let n = 0;
    for (const id of aLiberer.all({ limite: maintenant - LIBERATION_INACTIVITE_S })) {
      if (libererJoueur(id, maintenant)) n++;
    }
    return n;
  }

  return { avertir, libererAbsents };
}
