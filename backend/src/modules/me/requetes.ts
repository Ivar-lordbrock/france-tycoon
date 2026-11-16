import { type MoiReponse, type Profil, revenuSol } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

interface LigneProfil {
  id: number;
  pseudo: string;
  email: string;
  avatarUrl: string | null;
  markerColor: string;
  createdAt: number;
}

const COLONNES_PROFIL = `id, pseudo, email, avatar_url AS avatarUrl, marker_color AS markerColor, created_at AS createdAt`;

export function lireProfil(db: Base, userId: number): Profil {
  const profil = db.prepare<[number], LigneProfil>(`SELECT ${COLONNES_PROFIL} FROM users WHERE id = ?`).get(userId);
  if (!profil) throw new Error(`Joueur inconnu : ${userId}`);
  return profil;
}

/** GET /me : profil, portefeuille, revenu par heure, limites, notifications non lues. */
export function lireMoi(db: Base, userId: number): MoiReponse {
  const ligne = db
    .prepare<
      [number],
      LigneProfil & {
        cash: number;
        gems: number;
        maxTerritories: number;
        buildQueueSlots: number;
        newbieShieldUntil: number;
        unread: number;
      }
    >(`
      SELECT ${COLONNES_PROFIL},
        cash, premium_currency AS gems, max_territories AS maxTerritories, build_queue_slots AS buildQueueSlots,
        newbie_shield_until AS newbieShieldUntil,
        (SELECT count(*) FROM notifications AS n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
      FROM users AS u WHERE id = ?`)
    .get(userId);
  if (!ligne) throw new Error(`Joueur inconnu : ${userId}`);

  // Revenu du sol de chaque territoire (5.3) ; les bâtiments s'y ajoutent à l'étape 3.
  const valeurs = db
    .prepare<[number], number>('SELECT base_value FROM territories WHERE owner_id = ?')
    .pluck()
    .all(userId);
  const { cash, gems, maxTerritories, buildQueueSlots, newbieShieldUntil, unread, ...user } = ligne;
  return {
    user,
    wallet: { cash, gems },
    incomePerHour: valeurs.reduce((total, v0) => total + revenuSol(v0), 0),
    territories: { owned: valeurs.length, max: maxTerritories },
    buildQueueSlots,
    newbieShieldUntil,
    unreadNotifications: unread,
  };
}
