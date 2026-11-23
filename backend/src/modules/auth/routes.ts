import { createHash } from 'node:crypto';
import {
  type ConfigConnexion,
  configConnexionSchema,
  connexionDevCorpsSchema,
  connexionGoogleCorpsSchema,
  connexionReponseSchema,
  normaliserNom,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { lireProfil } from '../me/requetes.ts';
import { connecterJoueur, type Identite } from './comptes.ts';
import { creerVerifierGoogle, type IdentiteGoogle, type VerifierGoogle } from './google.ts';
import { effacerCookie, exigerJoueur, poserCookie } from './requete.ts';
import { fermerSession, NOM_COOKIE, ouvrirSession } from './sessions.ts';

export interface OptionsAuth {
  /** `GOOGLE_CLIENT_ID` ; `null` = connexion Google pas encore configurée. */
  googleClientId: string | null;
  /** Connexion de développement (`AUTH_DEV`), jamais en production. */
  devLogin: boolean;
  /** `IP_SALT` : sel des IP hachées notées à chaque connexion (anti-triche) ; vide = rien n'est noté. */
  ipSalt?: string;
  cookieSecure: boolean;
  /** Pour les tests : remplace la vérification auprès de Google. */
  verifierGoogle?: VerifierGoogle;
}

/** Routes /auth : configuration de l'écran de connexion, Google, compte de test, déconnexion. */
export const routesAuth: FastifyPluginAsyncZod<OptionsAuth> = async (app, options) => {
  const { googleClientId, devLogin, cookieSecure, ipSalt = '' } = options;
  const verifier = options.verifierGoogle ?? (googleClientId ? creerVerifierGoogle(googleClientId) : null);

  const hacher = (texte: string) => createHash('sha256').update(ipSalt).update(texte).digest('hex').slice(0, 16);
  const noterConnexion = app.db.prepare<[number, string, string]>(
    'INSERT INTO login_events (user_id, ip_hash, ua_hash) VALUES (?, ?, ?)',
  );
  const oublierConnexions = app.db.prepare<[number]>('DELETE FROM login_events WHERE created_at < unixepoch() - ?');

  /** Ouvre la session, note la connexion (IP et navigateur hachés), pose le cookie et renvoie le profil. */
  const connecter = (identite: Identite, userAgent: string | undefined, ip: string) => {
    const { userId, isNew } = connecterJoueur(app.db, identite);
    const jeton = ouvrirSession(app.db, userId, userAgent);
    if (ipSalt) {
      noterConnexion.run(userId, hacher(ip), hacher(userAgent ?? ''));
      oublierConnexions.run(90 * 86_400); // 90 jours, comme le disent les mentions légales
    }
    return { jeton, corps: { user: lireProfil(app.db, userId), isNew } };
  };

  app.get('/config', { schema: { response: { 200: configConnexionSchema } } }, (): ConfigConnexion => {
    return { googleClientId, devLogin };
  });

  app.post(
    '/google',
    { schema: { body: connexionGoogleCorpsSchema, response: { 200: connexionReponseSchema } } },
    async (req, reply) => {
      if (!verifier) {
        throw new ErreurMetier(
          'FEATURE_DISABLED',
          404,
          'Connexion Google pas encore configurée : GOOGLE_CLIENT_ID est vide (voir docs/08-connexion-google.md).',
        );
      }
      let google: IdentiteGoogle;
      try {
        google = await verifier(req.body.credential);
      } catch (erreur) {
        req.log.warn({ err: erreur }, 'jeton Google refusé');
        throw new ErreurMetier('UNAUTHENTICATED', 401, 'Connexion Google refusée : jeton invalide ou expiré.');
      }
      if (!google.emailVerifie) {
        throw new ErreurMetier('UNAUTHENTICATED', 401, 'Ton adresse e-mail Google n’est pas vérifiée.');
      }
      const { jeton, corps } = connecter(
        { googleId: google.sub, email: google.email, nom: google.nom, avatarUrl: google.photo ?? null },
        req.headers['user-agent'],
        req.ip,
      );
      poserCookie(reply, jeton, cookieSecure);
      return corps;
    },
  );

  // Connexion sans Google, pour tester en local : la route n'existe pas si AUTH_DEV est faux.
  if (devLogin) {
    app.post(
      '/dev',
      { schema: { body: connexionDevCorpsSchema, response: { 200: connexionReponseSchema } } },
      (req, reply) => {
        const cle = normaliserNom(req.body.pseudo).replaceAll(' ', '.') || 'joueur';
        const { jeton, corps } = connecter(
          { googleId: `dev:${cle}`, email: `${cle}@dev.invalid`, nom: req.body.pseudo },
          req.headers['user-agent'],
          req.ip,
        );
        poserCookie(reply, jeton, cookieSecure);
        return corps;
      },
    );
  }

  app.post('/logout', async (req, reply) => {
    exigerJoueur(req);
    const jeton = req.cookies[NOM_COOKIE];
    if (jeton) fermerSession(app.db, jeton);
    effacerCookie(reply);
    await reply.code(204).send();
  });
};
