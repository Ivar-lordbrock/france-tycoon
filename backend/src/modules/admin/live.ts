import {
  banniereCorpsSchema,
  type ContenuCadeau,
  type ContenuSignalementClos,
  cadeauCorpsSchema,
  cadeauReponseSchema,
  idAdminParamsSchema,
  type LigneSignalement,
  listeSignalementsReponseSchema,
  maintenanceCorpsSchema,
  majSignalementCorpsSchema,
  rechercheSignalementsQuerySchema,
  type StatutSignalement,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { wallet } from '../wallet/wallet.ts';
import { acteurDe, creerAudit, exigerAdmin } from './audit.ts';

// Contrôle live (maintenance, bannière, cadeaux : admins) et suivi des signalements (toute l'équipe). Étape 4.

const maintenant = () => Math.floor(Date.now() / 1000);
const CLOS: readonly StatutSignalement[] = ['resolved', 'rejected'];

export const routesAdminLive: FastifyPluginAsyncZod = async (app) => {
  const db = app.db;
  const auditer = creerAudit(db);
  const etat = db.prepare<[], { maintenance: string | null; banner: string | null; bannerUntil: number | null }>(
    'SELECT maintenance_message AS maintenance, banner_text AS banner, banner_until AS bannerUntil FROM site_status WHERE id = 1',
  );
  const notifier = db.prepare<[number, string, string, number]>(
    'INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, ?, ?, ?)',
  );

  const poserMaintenance = db.prepare<[string | null]>(
    'UPDATE site_status SET maintenance_message = ?, updated_at = unixepoch() WHERE id = 1',
  );
  app.put('/site/maintenance', { schema: { body: maintenanceCorpsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    db.transaction(() => {
      const avant = etat.get()?.maintenance ?? null;
      poserMaintenance.run(req.body.message);
      auditer(acteur, {
        action: 'site.maintenance',
        cible: { type: 'site', id: 'maintenance' },
        avant: { message: avant },
        apres: { message: req.body.message },
      });
    }).immediate();
    return reply.code(204).send();
  });

  const poserBanniere = db.prepare<[string | null, number | null]>(
    'UPDATE site_status SET banner_text = ?, banner_until = ?, updated_at = unixepoch() WHERE id = 1',
  );
  app.put('/site/banner', { schema: { body: banniereCorpsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    const { text, hours } = req.body;
    const until = text !== null && hours !== null ? maintenant() + hours * 3_600 : null;
    db.transaction(() => {
      const avant = etat.get();
      poserBanniere.run(text, until);
      auditer(acteur, {
        action: 'site.banner',
        cible: { type: 'site', id: 'banner' },
        avant: { text: avant?.banner ?? null, until: avant?.bannerUntil ?? null },
        apres: { text, until },
      });
    }).immediate();
    return reply.code(204).send();
  });

  const joueurCadeau = db
    .prepare<[number], number>("SELECT id FROM users WHERE id = ? AND status <> 'deleted'")
    .pluck();
  const actifs = db.prepare<[number], number>("SELECT id FROM users WHERE status = 'active' AND id <> ?").pluck();

  // Cadeau : par le journal des transactions (`admin_adjustment`), et un message à chaque joueur.
  app.post('/gifts', { schema: { body: cadeauCorpsSchema, response: { 200: cadeauReponseSchema } } }, (req) => {
    const acteur = exigerAdmin(req);
    const { playerId, currency, amount, reason } = req.body;
    const count = db
      .transaction((): number => {
        let ids: number[];
        if (playerId === undefined) ids = actifs.all(acteur.id);
        else {
          // À soi-même : seulement un admin d'office (ADMIN_EMAILS), qui tient déjà le serveur.
          if (playerId === acteur.id && !acteur.fixe) {
            throw new ErreurMetier('FORBIDDEN', 403, 'Pas de cadeau à toi-même (réservé aux admins d’office).');
          }
          const id = joueurCadeau.get(playerId);
          if (id === undefined) throw new ErreurMetier('NOT_FOUND', 404, 'Joueur introuvable.');
          ids = [id];
        }
        const t = maintenant();
        const contenu = JSON.stringify({ currency, amount, message: reason } satisfies ContenuCadeau);
        for (const id of ids) {
          wallet.apply(db, {
            userId: id,
            currency,
            amount,
            reason: 'admin_adjustment',
            metadata: { by: acteur.id, gift: true, reason },
          });
          notifier.run(id, 'gift_received', contenu, t);
        }
        auditer(acteur, {
          action: 'gift.send',
          cible: playerId === undefined ? { type: 'players', id: 'active' } : { type: 'player', id: playerId },
          apres: { currency, amount, count: ids.length },
          motif: reason,
        });
        return ids.length;
      })
      .immediate();
    return { count };
  });

  const signalements = db.prepare<
    [string],
    Omit<LigneSignalement, 'player'> & { userId: number | null; pseudo: string | null }
  >(`
    SELECT r.id, r.user_id AS userId, u.pseudo, r.body, r.page, r.status, r.staff_note AS staffNote,
      r.created_at AS createdAt, r.updated_at AS updatedAt
    FROM player_reports AS r LEFT JOIN users AS u ON u.id = r.user_id
    WHERE r.status = ?
    ORDER BY r.created_at DESC
    LIMIT 100`);

  app.get(
    '/reports',
    { schema: { querystring: rechercheSignalementsQuerySchema, response: { 200: listeSignalementsReponseSchema } } },
    (req) => ({
      reports: signalements.all(req.query.status).map(({ userId, pseudo, ...r }) => ({
        ...r,
        player: userId === null ? null : { id: userId, pseudo: pseudo ?? '' },
      })),
    }),
  );

  const signalement = db.prepare<
    [number],
    { id: number; userId: number | null; body: string; status: StatutSignalement; staffNote: string | null }
  >('SELECT id, user_id AS userId, body, status, staff_note AS staffNote FROM player_reports WHERE id = ?');
  const majSignalement = db.prepare<[string, string | null, number]>(
    'UPDATE player_reports SET status = ?, staff_note = ?, updated_at = unixepoch() WHERE id = ?',
  );

  app.patch(
    '/reports/:id',
    { schema: { params: idAdminParamsSchema, body: majSignalementCorpsSchema } },
    (req, reply) => {
      const acteur = acteurDe(req);
      const { status } = req.body;
      const note = req.body.note || null;
      db.transaction(() => {
        const r = signalement.get(req.params.id);
        if (!r) throw new ErreurMetier('NOT_FOUND', 404, 'Signalement introuvable.');
        majSignalement.run(status, note, r.id);
        // Clos pour la première fois : le joueur le sait.
        if (r.userId !== null && CLOS.includes(status) && !CLOS.includes(r.status)) {
          const extrait = r.body.length > 60 ? `${r.body.slice(0, 60)}…` : r.body;
          const contenu: ContenuSignalementClos = {
            reportId: r.id,
            status: status as ContenuSignalementClos['status'],
            excerpt: extrait,
          };
          notifier.run(r.userId, 'report_closed', JSON.stringify(contenu), maintenant());
        }
        auditer(acteur, {
          action: 'report.update',
          cible: { type: 'report', id: r.id },
          avant: { status: r.status, note: r.staffNote },
          apres: { status, note },
        });
      }).immediate();
      return reply.code(204).send();
    },
  );
};
