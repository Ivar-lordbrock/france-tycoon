import { CAPITAL_DEPART, PROTECTION_DEBUTANT_S, PSEUDO_MAX, PSEUDO_MIN } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { wallet } from '../wallet/wallet.ts';

/** Ce qu'on sait d'un joueur au moment de sa connexion (Google, ou compte de test en local). */
export interface Identite {
  /** `sub` du jeton Google, ou `dev:<nom>` pour un compte de test. */
  googleId: string;
  email: string;
  /** Nom affiché par Google : sert à proposer un pseudo à l'inscription. */
  nom?: string;
  avatarUrl?: string | null;
}

/**
 * Retrouve le joueur, ou crée son compte au premier passage : pseudo libre, protection
 * débutant de 72 h et 30 000 ₮ (`signup_bonus`, via `wallet.apply`), en une transaction.
 */
export function connecterJoueur(
  db: Base,
  identite: Identite,
  maintenant = Math.floor(Date.now() / 1000),
): { userId: number; isNew: boolean } {
  const connecter = db.transaction((): { userId: number; isNew: boolean } => {
    const existant = db
      .prepare<[string], { id: number; status: string }>('SELECT id, status FROM users WHERE google_id = ?')
      .get(identite.googleId);

    if (existant) {
      if (existant.status === 'banned' || existant.status === 'deleted') {
        throw new ErreurMetier('FORBIDDEN', 403, 'Ce compte est fermé.');
      }
      db.prepare(`
        UPDATE users SET
          avatar_url = coalesce(?, avatar_url),
          status = 'active',
          last_active_at = ?,
          updated_at = ?
        WHERE id = ?`).run(identite.avatarUrl ?? null, maintenant, maintenant, existant.id);
      return { userId: existant.id, isNew: false };
    }

    const pseudo = pseudoLibre(db, identite.nom || identite.email.split('@')[0] || '');
    const userId = db
      .prepare<unknown[], number>(`
        INSERT INTO users (google_id, email, pseudo, avatar_url, newbie_shield_until,
          income_collected_at, last_active_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`)
      .pluck()
      .get(
        identite.googleId,
        identite.email,
        pseudo,
        identite.avatarUrl ?? null,
        maintenant + PROTECTION_DEBUTANT_S,
        maintenant,
        maintenant,
        maintenant,
        maintenant,
      ) as number;

    wallet.apply(db, {
      userId,
      currency: 'cash',
      amount: CAPITAL_DEPART,
      reason: 'signup_bonus',
      ref: { type: 'user', id: userId },
      idempotencyKey: `signup_bonus:${userId}`,
    });
    return { userId, isNew: true };
  });
  return connecter.immediate();
}

/**
 * Pseudo proposé à l'inscription, d'après le nom Google : caractères autorisés seulement,
 * 3 à 24 caractères, et un numéro ajouté s'il est déjà pris (« Julie », « Julie 2 »…).
 */
export function pseudoLibre(db: Base, souhait: string): string {
  let base = souhait
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .slice(0, PSEUDO_MAX - 5)
    .trim();
  if (base.length < PSEUDO_MIN) base = 'Joueur';

  const pris = db.prepare<[string], number>('SELECT 1 FROM users WHERE pseudo = ?').pluck();
  if (!pris.get(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidat = `${base} ${n}`;
    if (!pris.get(candidat)) return candidat;
  }
  return `${base} ${Date.now() % 100_000}`;
}
