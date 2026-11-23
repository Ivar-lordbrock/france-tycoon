import type { ChantierFini, MoiReponse, Profil } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerLecteurRevenus, revenuDuJoueur } from '../income/revenus.ts';
import { creerLecteurReglages } from '../reglages/calendrier.ts';

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

interface LigneMoi extends LigneProfil {
  cash: number;
  gems: number;
  maxTerritories: number;
  rankLevel: number;
  buildQueueSlots: number;
  newbieShieldUntil: number;
  unread: number;
}

/** Nombre maximum de chantiers finis dans le résumé au retour. */
const RESUME_MAX = 50;

/** GET /me : profil, portefeuille, revenu par heure, limites, notifications non lues, résumé au retour. */
export function creerLecteurMoi(db: Base) {
  const moi = db.prepare<[number], LigneMoi>(`
    SELECT ${COLONNES_PROFIL},
      cash, premium_currency AS gems, max_territories AS maxTerritories, rank_level AS rankLevel, build_queue_slots AS buildQueueSlots,
      newbie_shield_until AS newbieShieldUntil,
      (SELECT count(*) FROM notifications AS n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
    FROM users AS u WHERE id = ?`);
  const finis = db.prepare<[number, number], { id: number; payload: string }>(`
    SELECT id, payload FROM notifications
    WHERE user_id = ? AND kind = 'building_done' AND read_at IS NULL
    ORDER BY created_at, id
    LIMIT ?`);
  const lireTerritoires = creerLecteurRevenus(db);
  const reglages = creerLecteurReglages(db);

  return function lireMoi(userId: number, maintenant: number): MoiReponse {
    const ligne = moi.get(userId);
    if (!ligne) throw new Error(`Joueur inconnu : ${userId}`);
    const territoires = [...lireTerritoires(userId).values()];
    const { cash, gems, maxTerritories, rankLevel, buildQueueSlots, newbieShieldUntil, unread, ...user } = ligne;
    return {
      user,
      wallet: { cash, gems },
      incomePerHour: revenuDuJoueur(territoires, maintenant, reglages(maintenant).income),
      territories: { owned: territoires.length, max: maxTerritories },
      rankLevel,
      buildQueueSlots,
      newbieShieldUntil,
      unreadNotifications: unread,
      finishedWorks: finis
        .all(userId, RESUME_MAX)
        .map(({ id, payload }) => ({ ...(JSON.parse(payload) as ChantierFini), notificationId: id })),
    };
  };
}
