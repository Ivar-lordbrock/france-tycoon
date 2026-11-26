import type {
  NotificationJeu,
  NotificationsQuery,
  NotificationsReponse,
  TypeNotification,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

// GET /me/notifications : le centre de notifications, les plus récents d'abord (docs/04).

/** Les types connus du contrat (`shared/src/api/notifications.ts`) ; un nouveau type oublié ici ne compile pas. */
const TYPES_CONNUS = {
  building_done: true,
  takeover_received: true,
  takeover_resolved: true,
  inactivity_warning: true,
  inactivity_released: true,
  quest_completed: true,
  rank_up: true,
  gift_received: true,
  report_closed: true,
  project_completed: true,
} satisfies Record<TypeNotification, true>;
export const TYPES_NOTIFICATION = JSON.stringify(Object.keys(TYPES_CONNUS));

export interface LigneNotification {
  id: number;
  kind: string;
  payload: string;
  createdAt: number;
  readAt: number | null;
}

export const COLONNES_NOTIFICATION = 'id, kind, payload, created_at AS createdAt, read_at AS readAt';

/** Une ligne de `notifications` telle que le front la reçoit (contenu JSON décodé). */
export function versNotification(ligne: LigneNotification): NotificationJeu {
  return { ...ligne, payload: JSON.parse(ligne.payload) } as NotificationJeu;
}

export function creerListeNotifications(db: Base) {
  const page = db.prepare<{ moi: number; avant: number | null; nombre: number; types: string }, LigneNotification>(`
    SELECT ${COLONNES_NOTIFICATION} FROM notifications
    WHERE user_id = @moi AND (@avant IS NULL OR id < @avant) AND kind IN (SELECT value FROM json_each(@types))
    ORDER BY id DESC
    LIMIT @nombre`);
  const nonLues = db
    .prepare<[number], number>('SELECT count(*) FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .pluck();

  return function listerNotifications(moi: number, { before, limit }: NotificationsQuery): NotificationsReponse {
    // Une ligne de plus que demandé : s'il y en a une, il existe une page suivante.
    const lignes = page.all({ moi, avant: before ?? null, nombre: limit + 1, types: TYPES_NOTIFICATION });
    const suite = lignes.length > limit;
    const notifications = lignes.slice(0, limit).map(versNotification);
    return {
      notifications,
      nextCursor: suite ? (notifications.at(-1)?.id ?? null) : null,
      unreadNotifications: nonLues.get(moi) ?? 0,
    };
  };
}
