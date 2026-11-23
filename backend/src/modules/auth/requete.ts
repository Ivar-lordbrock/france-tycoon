import cookie from '@fastify/cookie';
import { FUSEAU_JEU } from '@france-tycoon/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { DUREE_SESSION_S, lireSession, NOM_COOKIE } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Joueur connecté (cookie de session valide), sinon `null`. */
    joueur: { id: number } | null;
  }
}

// Suspendu ou en maintenance, on regarde sans agir ; on peut quand même se connecter, lire ses messages
// et signaler un bug. Le dashboard /admin a ses propres gardes.
const PERMIS = /^\/api\/v1\/(auth|admin|reports|me\/notifications)(\/|\?|$)/;

/** Maintenance (dashboard /admin, étape 4) : le message, et qui fait partie de l'équipe (elle passe). */
function requetesMaintenance(db: Base, adminEmails: readonly string[]) {
  const admins = JSON.stringify(adminEmails.map((e) => e.toLowerCase()));
  const message = db.prepare<[], string | null>('SELECT maintenance_message FROM site_status WHERE id = 1').pluck();
  const equipe = db
    .prepare<[number, string], number>(`
      SELECT 1 FROM users AS u WHERE u.id = ?
        AND (lower(u.email) IN (SELECT value FROM json_each(?)) OR EXISTS (SELECT 1 FROM staff_roles WHERE user_id = u.id))`)
    .pluck();
  return (userId: number) => {
    const m = message.get();
    return m && equipe.get(userId, admins) === undefined ? m : null;
  };
}

/**
 * Lit le cookie `sid` avant chaque route et remplit `req.joueur` ; refuse les actions d'un compte suspendu,
 * et celles des joueurs pendant une maintenance.
 */
export function brancherSessions(
  app: FastifyInstance,
  { cookieSecure, adminEmails = [] }: { cookieSecure: boolean; adminEmails?: readonly string[] },
): void {
  app.register(cookie);
  app.decorateRequest('joueur', null);
  // Préparé au premier usage : les migrations tournent après la construction de l'app.
  let maintenancePour: ((userId: number) => string | null) | undefined;
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
    if (['GET', 'HEAD'].includes(req.method) || PERMIS.test(req.url)) return;
    if (session.suspension) {
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
    maintenancePour ??= requetesMaintenance(app.db, adminEmails);
    const maintenance = maintenancePour(session.userId);
    if (maintenance) throw new ErreurMetier('MAINTENANCE', 503, `Maintenance en cours : ${maintenance}`);
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
