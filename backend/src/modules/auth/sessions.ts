import { createHash, randomBytes } from 'node:crypto';
import type { Base } from '../../db/connexion.ts';

/** Une session dure 30 jours et se prolonge quand on joue (docs/02, 2.7). */
export const DUREE_SESSION_S = 30 * 86_400;
/** On ne réécrit la date d'expiration qu'une fois par jour au plus. */
const PROLONGER_APRES_S = 86_400;
/** `users.last_active_at` est mis à jour toutes les 5 minutes au plus (5.6). */
const ACTIVITE_APRES_S = 300;

export const NOM_COOKIE = 'sid';

/** En base, on ne garde que le hachage du jeton : une fuite de la base ne donne pas de session. */
const hacher = (jeton: string) => createHash('sha256').update(jeton).digest('hex');
const maintenantS = () => Math.floor(Date.now() / 1000);

/** Crée une session et renvoie le jeton à mettre dans le cookie (jamais stocké tel quel). */
export function ouvrirSession(db: Base, userId: number, userAgent?: string, maintenant = maintenantS()): string {
  const jeton = randomBytes(32).toString('base64url');
  db.transaction(() => {
    db.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      hacher(jeton),
      userId,
      maintenant,
      maintenant + DUREE_SESSION_S,
      maintenant,
      userAgent?.slice(0, 300) ?? null,
    );
  }).immediate();
  return jeton;
}

/**
 * Joueur de la session, ou `null` (jeton inconnu, session expirée, compte fermé).
 * Prolonge la session et note l'activité du joueur, sans écrire à chaque requête.
 */
export function lireSession(
  db: Base,
  jeton: string,
  maintenant = maintenantS(),
): { userId: number; prolongee: boolean } | null {
  const id = hacher(jeton);
  const ligne = db
    .prepare<[string, number], { userId: number; expiresAt: number; lastActiveAt: number }>(`
      SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.last_active_at AS lastActiveAt
      FROM sessions AS s JOIN users AS u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.status IN ('active', 'dormant')`)
    .get(id, maintenant);
  if (!ligne) return null;

  const prolongee = ligne.expiresAt - maintenant < DUREE_SESSION_S - PROLONGER_APRES_S;
  const actif = maintenant - ligne.lastActiveAt >= ACTIVITE_APRES_S;
  if (prolongee || actif) {
    db.transaction(() => {
      if (prolongee) {
        db.prepare('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE id = ?').run(
          maintenant + DUREE_SESSION_S,
          maintenant,
          id,
        );
      }
      if (actif) db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(maintenant, ligne.userId);
    }).immediate();
  }
  return { userId: ligne.userId, prolongee };
}

export function fermerSession(db: Base, jeton: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(hacher(jeton));
  }).immediate();
}
