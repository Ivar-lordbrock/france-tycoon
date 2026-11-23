import { z } from 'zod';

// GET /roadmap : feuille de route publique (page /roadmap), table `roadmap_features` (migration 009).

export const categorieFeuilleDeRouteSchema = z.enum(['social', 'gameplay', 'economy']);
export type CategorieFeuilleDeRoute = z.infer<typeof categorieFeuilleDeRouteSchema>;

/** `planned` Prévu, `in_progress` En cours, `released` Déployé. */
export const statutFeuilleDeRouteSchema = z.enum(['planned', 'in_progress', 'released']);
export type StatutFeuilleDeRoute = z.infer<typeof statutFeuilleDeRouteSchema>;

export const fonctionnalitePrevueSchema = z.object({
  code: z.string(),
  category: categorieFeuilleDeRouteSchema,
  status: statutFeuilleDeRouteSchema,
  title: z.string(),
  summary: z.string(),
  details: z.array(z.string()),
});
export type FonctionnalitePrevue = z.infer<typeof fonctionnalitePrevueSchema>;

/** Dans l'ordre d'affichage. */
export const feuilleDeRouteReponseSchema = z.object({ features: z.array(fonctionnalitePrevueSchema) });
export type FeuilleDeRouteReponse = z.infer<typeof feuilleDeRouteReponseSchema>;
