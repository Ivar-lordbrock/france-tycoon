import { z } from 'zod';

/** Les trois réglages à chaud en % (100 = normal) : prix d'achat, revenus, coût des bâtiments (étape 6). */
export const reglagesSchema = z.object({
  price: z.number().int().positive(),
  income: z.number().int().positive(),
  building: z.number().int().positive(),
});

// GET /api/v1/status — public : maintenance et bannière du moment (dashboard /admin, étape 4).
export const etatSiteSchema = z.object({
  /** Message de maintenance : les actions sont en pause. `null` = jeu ouvert. */
  maintenance: z.string().nullable(),
  /** Bannière d'annonce ; `until` `null` = jusqu'à ce que l'équipe la retire. */
  banner: z.object({ text: z.string(), until: z.number().int().nullable() }).nullable(),
  /** Réglages qui s'appliquent maintenant (base × événements en cours). */
  settings: reglagesSchema,
  /** Événements en cours, avec leur fin automatique. */
  events: z.array(reglagesSchema.extend({ title: z.string(), endsAt: z.number().int() })),
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
