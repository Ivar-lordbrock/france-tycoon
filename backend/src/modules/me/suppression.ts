import { createHash } from 'node:crypto';
import type { Base } from '../../db/connexion.ts';
import { creerEncaisseurSimple } from '../income/revenus.ts';
import { creerIssuesOpa } from '../takeovers/issues.ts';

// Supprimer son compte (docs/03, 3.5 « RGPD ») : on anonymise au lieu d'effacer la ligne, car le
// journal de l'argent (`wallet_transactions`, en ajout seul) et l'historique des communes gardent son id.
// Ses communes redeviennent libres (bâtiments détruits, rien n'est racheté), ses OPA en cours sont
// annulées (l'offre revient à l'attaquant, comme pour un joueur inactif), ses sessions et ses messages
// sont effacés. Une nouvelle connexion avec le même compte Google crée un compte neuf.

export function creerSuppressionCompte(db: Base) {
  const emailDe = db.prepare<[number], string>("SELECT email FROM users WHERE id = ? AND status <> 'deleted'").pluck();
  // Le « # » est interdit dans les pseudos choisis : « Joueur supprimé #12 » ne peut pas être pris.
  const anonymiser = db.prepare<{ id: number; email: string; maintenant: number }>(`
    UPDATE users SET status = 'deleted', google_id = 'deleted:' || id, email = @email,
      pseudo = 'Joueur supprimé #' || id, avatar_url = NULL, updated_at = @maintenant
    WHERE id = @id`);
  const opaEnCours = db
    .prepare<[number, number], number>(
      "SELECT id FROM takeovers WHERE status = 'pending' AND (attacker_id = ? OR defender_id = ?) ORDER BY id",
    )
    .pluck();
  const territoires = db.prepare<[number], number>('SELECT id FROM territories WHERE owner_id = ? ORDER BY id').pluck();
  const detruireBatiments = db.prepare<[number]>('DELETE FROM buildings WHERE territory_id = ?');
  const liberer = db.prepare<[number, number]>(`
    UPDATE territories SET owner_id = NULL, acquired_at = NULL, acquired_price = NULL,
      shield_until = NULL, fortification_value = 0, is_capital = 0
    WHERE id = ? AND owner_id = ?`);
  // Pas de raison « compte supprimé » dans la table (001, CHECK) : « admin », sans prix.
  const noterHistorique = db.prepare<[number, number, number]>(`
    INSERT INTO territory_ownership_history (territory_id, from_user_id, to_user_id, reason, price, created_at)
    VALUES (?, ?, NULL, 'admin', NULL, ?)`);
  const effacerSessions = db.prepare<[number]>('DELETE FROM sessions WHERE user_id = ?');
  const effacerMessages = db.prepare<[number]>('DELETE FROM notifications WHERE user_id = ?');
  const issues = creerIssuesOpa(db, creerEncaisseurSimple(db));

  /** Supprime (anonymise) le compte, en une transaction. `false` s'il l'était déjà. */
  return function supprimerCompte(userId: number, maintenant: number): boolean {
    return db
      .transaction((): boolean => {
        const email = emailDe.get(userId);
        if (email === undefined) return false;

        // Anonymisé d'abord : les messages de fin d'OPA envoyés à l'autre joueur n'ont plus son pseudo.
        const hachage = createHash('sha256').update(email.toLowerCase()).digest('hex');
        anonymiser.run({ id: userId, email: `deleted:${hachage}`, maintenant });
        for (const id of opaEnCours.all(userId, userId)) {
          const o = issues.lire(id);
          if (o) issues.annuler(o, maintenant);
        }
        for (const id of territoires.all(userId)) {
          detruireBatiments.run(id);
          if (liberer.run(id, userId).changes !== 1) throw new Error(`Libération du territoire ${id} impossible`);
          noterHistorique.run(id, userId, maintenant);
        }
        effacerSessions.run(userId);
        effacerMessages.run(userId);
        return true;
      })
      .immediate();
  };
}
