import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErreurMetier } from '../../erreurs.ts';
import { DUREE_SESSION_S, lireSession, NOM_COOKIE } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Joueur connecté (cookie de session valide), sinon `null`. */
    joueur: { id: number } | null;
  }
}

/** Lit le cookie `sid` avant chaque route et remplit `req.joueur`. */
export function brancherSessions(app: FastifyInstance, { cookieSecure }: { cookieSecure: boolean }): void {
  app.register(cookie);
  app.decorateRequest('joueur', null);
  app.addHook('preHandler', async (req, reply) => {
    const jeton = req.cookies[NOM_COOKIE];
    if (!jeton) return;
    const session = lireSession(app.db, jeton);
    if (!session) {
      effacerCookie(reply);
      return;
    }
    req.joueur = { id: session.userId };
    if (session.prolongee) poserCookie(reply, jeton, cookieSecure);
  });
}

/** Cookie HttpOnly (illisible en JavaScript), SameSite=Lax, Secure en production. */
export function poserCookie(reply: FastifyReply, jeton: string, secure: boolean): void {
  reply.setCookie(NOM_COOKIE, jeton, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: DUREE_SESSION_S });
}

export function effacerCookie(reply: FastifyReply): void {
  reply.clearCookie(NOM_COOKIE, { path: '/' });
}

/** Pour les routes 🔒 : l'identifiant du joueur connecté, ou une erreur 401. */
export function exigerJoueur(req: FastifyRequest): number {
  if (!req.joueur) throw new ErreurMetier('UNAUTHENTICATED', 401, 'Connecte-toi pour continuer.');
  return req.joueur.id;
}
