import {
  capitaleReponseSchema,
  deplacerCapitaleCorpsSchema,
  encaissementReponseSchema,
  fileConstructionSchema,
  lireNotificationsCorpsSchema,
  lireNotificationsReponseSchema,
  mesOpaQuerySchema,
  mesOpaReponseSchema,
  mesTerritoiresSchema,
  modifierMoiCorpsSchema,
  moiReponseSchema,
  notificationsQuerySchema,
  notificationsReponseSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';
import { creerLecteurChantiers } from '../buildings/file.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { creerListeNotifications } from '../notifications/liste.ts';
import { creerReponsesOpa } from '../takeovers/reponses.ts';
import { creerDeplacementCapitale } from './capitale.ts';
import { creerLecteurMoi } from './requetes.ts';
import { creerLecteurMesTerritoires } from './territoires.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Routes 🔒 /me : mon profil, mon portefeuille, mes territoires, mes revenus, mes OPA, mes messages. */
export const routesMoi: FastifyPluginAsyncZod = async (app) => {
  const lireMoi = creerLecteurMoi(app.db);
  const lireMesTerritoires = creerLecteurMesTerritoires(app.db);
  const encaisser = creerEncaisseur(app.db);
  const lireChantiers = creerLecteurChantiers(app.db);
  const deplacerCapitale = creerDeplacementCapitale(app.db);
  const { mesOpa } = creerReponsesOpa(app.db);
  const listerNotifications = creerListeNotifications(app.db);
  const files = app.db.prepare<[number], number>('SELECT build_queue_slots FROM users WHERE id = ?').pluck();
  const pseudoPris = app.db
    .prepare<[string, number], number>('SELECT 1 FROM users WHERE pseudo = ? AND id <> ?')
    .pluck();
  const modifier = app.db.prepare<{ id: number; pseudo: string | null; couleur: string | null }>(`
    UPDATE users SET
      pseudo = coalesce(@pseudo, pseudo),
      marker_color = coalesce(@couleur, marker_color),
      updated_at = unixepoch()
    WHERE id = @id`);
  const marquerLus = app.db.prepare<[number, number, string]>(
    'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))',
  );
  const marquerTousLus = app.db.prepare<[number, number]>(
    'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
  );
  const nonLues = app.db
    .prepare<[number], number>('SELECT count(*) FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .pluck();

  // Toute route qui lit le portefeuille encaisse d'abord les revenus en attente (docs/04).

  app.get('/', { schema: { response: { 200: moiReponseSchema } } }, (req) => {
    const id = exigerJoueur(req);
    const t = maintenant();
    return app.db
      .transaction(() => {
        encaisser(id, t);
        return lireMoi(id, t);
      })
      .immediate();
  });

  app.get('/territories', { schema: { response: { 200: mesTerritoiresSchema } } }, (req) => {
    const id = exigerJoueur(req);
    const t = maintenant();
    return app.db
      .transaction(() => {
        encaisser(id, t);
        return lireMesTerritoires(id, t);
      })
      .immediate();
  });

  app.get('/construction-queue', { schema: { response: { 200: fileConstructionSchema } } }, (req) => {
    const id = exigerJoueur(req);
    return app.db
      .transaction(() => {
        encaisser(id, maintenant()); // termine les chantiers finis : il ne reste que ceux en cours
        return { slots: files.get(id) ?? 1, works: lireChantiers(id) };
      })
      .immediate();
  });

  app.get(
    '/takeovers',
    { schema: { querystring: mesOpaQuerySchema, response: { 200: mesOpaReponseSchema } } },
    (req, reply) => {
      const id = exigerJoueur(req);
      reply.header('cache-control', 'private, no-store');
      return { takeovers: mesOpa(id, req.query, maintenant()) };
    },
  );

  app.post(
    '/capital',
    { schema: { body: deplacerCapitaleCorpsSchema, response: { 200: capitaleReponseSchema } } },
    (req) => deplacerCapitale(exigerJoueur(req), req.body.insee, maintenant()),
  );

  app.post('/collect', { schema: { response: { 200: encaissementReponseSchema } } }, (req) => {
    const id = exigerJoueur(req);
    const { collected, cash, incomePerHour } = app.db.transaction(() => encaisser(id, maintenant())).immediate();
    return { collected, cash, incomePerHour };
  });

  app.get(
    '/notifications',
    { schema: { querystring: notificationsQuerySchema, response: { 200: notificationsReponseSchema } } },
    (req, reply) => {
      const id = exigerJoueur(req);
      reply.header('cache-control', 'private, no-store');
      return app.db
        .transaction(() => {
          encaisser(id, maintenant()); // les chantiers finis ont leur message dans la liste
          return listerNotifications(id, req.query);
        })
        .immediate();
    },
  );

  app.post(
    '/notifications/read',
    { schema: { body: lireNotificationsCorpsSchema, response: { 200: lireNotificationsReponseSchema } } },
    (req) => {
      const id = exigerJoueur(req);
      const corps = req.body;
      return app.db
        .transaction(() => {
          if ('all' in corps) marquerTousLus.run(maintenant(), id);
          else marquerLus.run(maintenant(), id, JSON.stringify(corps.ids));
          return { unreadNotifications: nonLues.get(id) ?? 0 };
        })
        .immediate();
    },
  );

  app.patch('/', { schema: { body: modifierMoiCorpsSchema, response: { 200: moiReponseSchema } } }, (req) => {
    const id = exigerJoueur(req);
    const { pseudo, markerColor } = req.body;
    const t = maintenant();
    return app.db
      .transaction(() => {
        if (pseudo !== undefined && pseudoPris.get(pseudo, id)) {
          throw new ErreurMetier('PSEUDO_TAKEN', 409, `Le pseudo « ${pseudo} » est déjà pris.`);
        }
        modifier.run({ id, pseudo: pseudo ?? null, couleur: markerColor?.toLowerCase() ?? null });
        encaisser(id, t);
        return lireMoi(id, t);
      })
      .immediate();
  });
};
