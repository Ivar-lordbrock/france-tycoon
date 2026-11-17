import { z } from 'zod';

// Routes /api/v1/me/notifications (docs/04-api.md, « Notifications et temps réel »).

/** POST /me/notifications/read : marquer des messages comme lus, par numéro ou tous d'un coup. */
export const lireNotificationsCorpsSchema = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export type LireNotificationsCorps = z.infer<typeof lireNotificationsCorpsSchema>;

export const lireNotificationsReponseSchema = z.object({
  /** Messages encore non lus après l'appel. */
  unreadNotifications: z.number().int().nonnegative(),
});
export type LireNotificationsReponse = z.infer<typeof lireNotificationsReponseSchema>;
