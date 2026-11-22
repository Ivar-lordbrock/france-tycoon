import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErreurMetier } from './erreurs.ts';

/** Requêtes par minute, par joueur connecté (sinon par adresse IP). Large : la carte et la recherche en font beaucoup. */
export const REQUETES_PAR_MINUTE = 300;
/** Connexions et déconnexions (`POST /auth/…`) par minute et par adresse IP. */
export const CONNEXIONS_PAR_MINUTE = 10;

export interface OptionsSecurite {
  /** `APP_ORIGIN` : seule origine acceptée pour ce qui modifie quelque chose. */
  origine: string;
}

const LECTURES = new Set(['GET', 'HEAD', 'OPTIONS']);
const estConnexion = (req: FastifyRequest) => req.method === 'POST' && req.url.startsWith('/api/v1/auth/');

/**
 * Contre les requêtes envoyées depuis un autre site (CSRF) : tout ce qui modifie doit porter `Origin: APP_ORIGIN`.
 * Contre les abus : limite de débit (429 `RATE_LIMITED`). À brancher avant les routes.
 */
export function brancherSecurite(app: FastifyInstance, { origine }: OptionsSecurite): void {
  app.addHook('onRequest', async (req) => {
    if (!LECTURES.has(req.method) && req.headers.origin !== origine) {
      throw new ErreurMetier('FORBIDDEN', 403, 'Requête refusée : elle ne vient pas du jeu.');
    }
  });

  app.register(rateLimit, {
    // Après la lecture du cookie de session (`preHandler` de brancherSessions) : compte par joueur.
    hook: 'preHandler',
    timeWindow: 60_000,
    max: (req) => (estConnexion(req) ? CONNEXIONS_PAR_MINUTE : REQUETES_PAR_MINUTE),
    // Deux compteurs séparés : beaucoup jouer ne bloque pas la déconnexion.
    keyGenerator: (req) => {
      if (estConnexion(req)) return `auth:${req.ip}`;
      return req.joueur ? `jeu:joueur ${req.joueur.id}` : `jeu:${req.ip}`;
    },
  });
}
