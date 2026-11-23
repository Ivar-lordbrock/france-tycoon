import { z } from 'zod';

// GET /api/v1/status — public : maintenance et bannière du moment (dashboard /admin, étape 4).
export const etatSiteSchema = z.object({
  /** Message de maintenance : les actions sont en pause. `null` = jeu ouvert. */
  maintenance: z.string().nullable(),
  /** Bannière d'annonce ; `until` `null` = jusqu'à ce que l'équipe la retire. */
  banner: z.object({ text: z.string(), until: z.number().int().nullable() }).nullable(),
});
export type EtatSite = z.infer<typeof etatSiteSchema>;

// POST /api/v1/reports — « Signaler un bug » (joueur connecté, 5 par jour).
export const SIGNALEMENTS_PAR_JOUR = 5;
export const signalerCorpsSchema = z.object({
  body: z.string().trim().min(10, 'Décris le problème en 10 caractères au moins').max(2000),
  /** Chemin de la page où était le joueur. */
  page: z.string().max(200).optional(),
});
export type SignalerCorps = z.infer<typeof signalerCorpsSchema>;

export const STATUTS_SIGNALEMENT = ['open', 'in_progress', 'resolved', 'rejected'] as const;
export type StatutSignalement = (typeof STATUTS_SIGNALEMENT)[number];
