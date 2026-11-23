import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

/** Racine du dépôt (les chemins relatifs du `.env` partent d'ici). */
export const RACINE = resolve(import.meta.dirname, '../..');

/** « true », « 1 », « oui » → vrai ; vide ou absent → faux. */
const booleen = z
  .string()
  .optional()
  .transform((texte) => ['true', '1', 'oui', 'yes'].includes((texte ?? '').trim().toLowerCase()));

const schemaConfig = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_PATH: z.string().min(1).default('./data/france-tycoon.sqlite'),
    /** ID client OAuth « Application Web » (docs/08-connexion-google.md). Vide = connexion Google désactivée. */
    GOOGLE_CLIENT_ID: z.string().trim().default(''),
    /** Connexion de développement sans Google : pour tester en local, refusée en production. */
    AUTH_DEV: booleen,
    /** Sel secret pour hacher les IP des connexions (anti-triche). Vide = connexions non notées. */
    IP_SALT: z.string().trim().default(''),
    /** E-mails Google admin d'office du dashboard /admin, séparés par des virgules (docs/10-admin.md). */
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((texte) =>
        texte
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
  })
  .refine((config) => !(config.AUTH_DEV && config.NODE_ENV === 'production'), {
    message: 'AUTH_DEV=true est interdit avec NODE_ENV=production (connexion sans Google)',
    path: ['AUTH_DEV'],
  });

export type Config = z.infer<typeof schemaConfig> & { cheminBase: string };

/** Charge `.env` (s'il existe) sans écraser les variables déjà définies. */
export function chargerFichierEnv(chemin = join(RACINE, '.env')): void {
  if (existsSync(chemin)) process.loadEnvFile(chemin);
}

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultat = schemaConfig.safeParse(env);
  if (!resultat.success) {
    throw new Error(`Configuration invalide (.env) :\n${z.prettifyError(resultat.error)}`);
  }
  const config = resultat.data;
  const cheminBase = config.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(RACINE, config.DATABASE_PATH);
  return { ...config, cheminBase };
}
