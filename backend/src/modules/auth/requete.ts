import cookie from '@fastify/cookie';
import { FUSEAU_JEU } from '@france-tycoon/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErreurMetier } from '../../erreurs.ts';
import { DUREE_SESSION_S, lireSession, NOM_COOKIE } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Joueur connecté (cookie de session valide), sinon `null`. */
    joueur: { id: number } | null;
  }
}

// Un joueur suspendu (dashboard /admin) regarde sans agir ; il peut quand même se déconnecter et lire ses messages.
const PERMIS_SUSPENDU = /^\/api\/v1\/(auth|admin|me\/notifications)\//;

/** Lit le cookie `sid` avant chaque route et remplit `req.joueur` ; refuse les actions d'un compte suspendu. */
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
    if (session.suspension && !['GET', 'HEAD'].includes(req.method) && !PERMIS_SUSPENDU.test(req.url)) {
      const fin = new Date(session.suspension.until * 1000).toLocaleString('fr-FR', {
        timeZone: FUSEAU_JEU,
        dateStyle: 'long',
        timeStyle: 'short',
      });
      throw new ErreurMetier(
        'ACCOUNT_SUSPENDED',
        403,
        `Ton compte est suspendu jusqu’au ${fin}. Motif : ${session.suspension.reason}`,
      );
    }
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
