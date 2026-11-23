import {
  ajusterCorpsSchema,
  type FicheJoueurReponse,
  ficheJoueurReponseSchema,
  idAdminParamsSchema,
  type LigneAudit,
  type LigneJoueur,
  listeJoueursReponseSchema,
  motifCorpsSchema,
  noteCorpsSchema,
  type Role,
  rechercheJoueursQuerySchema,
  roleCorpsSchema,
  suspendreCorpsSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { creerEncaisseur, creerLecteurRevenus, revenuDuJoueur } from '../income/revenus.ts';
import { creerLiberationBiens } from '../me/suppression.ts';
import { wallet } from '../wallet/wallet.ts';
import { type Acteur, acteurDe, creerAudit, exigerAdmin } from './audit.ts';

// Rang pour la règle « on n'agit que sur plus petit que soi ». Admin d'office (ADMIN_EMAILS) au-dessus de tout.
const RANG: Record<Role, number> = { player: 0, moderator: 1, admin: 2 };
const rang = (role: Role, fixe: boolean) => (fixe ? 3 : RANG[role]);

type LigneBrute = Omit<LigneJoueur, 'roleFixe'> & { roleFixe: 0 | 1 };
const COLONNES = `u.id, u.pseudo, u.email, u.status, u.cash, u.premium_currency AS gems,
  CASE WHEN u.suspended_until > unixepoch() THEN u.suspended_until END AS suspendedUntil,
  u.last_active_at AS lastActiveAt, u.created_at AS createdAt,
  (SELECT count(*) FROM territories WHERE owner_id = u.id) AS territories,
  lower(u.email) IN (SELECT value FROM json_each(@admins)) AS roleFixe,
  CASE WHEN lower(u.email) IN (SELECT value FROM json_each(@admins)) THEN 'admin' ELSE coalesce(s.role, 'player') END AS role`;
const versLigne = <T extends LigneBrute>({ roleFixe, ...l }: T) => ({ ...l, roleFixe: roleFixe === 1 });

export const routesAdminJoueurs: FastifyPluginAsyncZod<{ adminEmails: readonly string[] }> = async (
  app,
  { adminEmails },
) => {
  const db = app.db;
  const admins = JSON.stringify(adminEmails);
  const auditer = creerAudit(db);

  const rechercher = db.prepare<Record<string, unknown>, LigneBrute>(`
    SELECT * FROM (
      SELECT ${COLONNES}, u.google_id AS googleId
      FROM users AS u LEFT JOIN staff_roles AS s ON s.user_id = u.id
      WHERE u.status <> 'deleted'
    )
    WHERE (@q = '' OR pseudo LIKE @motif ESCAPE '\\' OR email LIKE @motif ESCAPE '\\'
           OR googleId = @q OR CAST(id AS TEXT) = @q)
      AND (@role IS NULL OR role = @role)
      AND (@status IS NULL OR (@status = 'suspended' AND suspendedUntil IS NOT NULL) OR status = @status)
    ORDER BY lastActiveAt DESC
    LIMIT 50`);

  app.get(
    '/players',
    { schema: { querystring: rechercheJoueursQuerySchema, response: { 200: listeJoueursReponseSchema } } },
    (req) => {
      const { q, role, status } = req.query;
      const motif = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      const lignes = rechercher.all({ admins, q, motif, role: role ?? null, status: status ?? null });
      return { players: lignes.map(({ googleId: _, ...l }: LigneBrute & { googleId?: string }) => versLigne(l)) };
    },
  );

  const lireCible = db.prepare<
    { admins: string; id: number },
    LigneBrute & { googleId: string; suspensionReason: string | null; netWorth: number }
  >(`
    SELECT ${COLONNES}, u.google_id AS googleId, u.net_worth AS netWorth,
      CASE WHEN u.suspended_until > unixepoch() THEN u.suspension_reason END AS suspensionReason
    FROM users AS u LEFT JOIN staff_roles AS s ON s.user_id = u.id
    WHERE u.id = @id AND u.status <> 'deleted'`);
  const cibleOu404 = (id: number) => {
    const cible = lireCible.get({ admins, id });
    if (!cible) throw new ErreurMetier('NOT_FOUND', 404, 'Joueur introuvable.');
    return versLigne(cible);
  };
  /** Jamais sur soi ; seulement sur un grade plus petit que le sien. */
  const cibleAutorisee = (acteur: Acteur & { fixe: boolean }, id: number) => {
    const cible = cibleOu404(id);
    if (cible.id === acteur.id) throw new ErreurMetier('FORBIDDEN', 403, 'Pas d’action sur ton propre compte.');
    if (rang(cible.role, cible.roleFixe) >= rang(acteur.grade, acteur.fixe)) {
      throw new ErreurMetier(
        'FORBIDDEN',
        403,
        cible.roleFixe
          ? 'Admin d’office (ADMIN_EMAILS) : intouchable depuis l’écran.'
          : 'Grade égal ou supérieur au tien.',
      );
    }
    return cible;
  };

  const lireRevenus = creerLecteurRevenus(db);
  const communes = db.prepare<
    [number],
    Omit<FicheJoueurReponse['communes'][number], 'isCapital'> & { isCapital: number }
  >(`
    SELECT t.id, t.insee_code AS insee, t.name, t.is_capital AS isCapital, t.acquired_at AS acquiredAt,
      (SELECT count(*) FROM buildings WHERE territory_id = t.id) AS buildings
    FROM territories AS t WHERE t.owner_id = ? ORDER BY t.name`);
  const transactions = db.prepare<[number], FicheJoueurReponse['transactions'][number]>(`
    SELECT id, currency, amount, balance_after AS balanceAfter, reason, created_at AS createdAt
    FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50`);
  const opa = db.prepare<{ id: number }, FicheJoueurReponse['takeovers'][number]>(`
    SELECT o.id, t.name AS territory, CASE WHEN o.attacker_id = @id THEN 'attacker' ELSE 'defender' END AS side,
      u.pseudo AS other, o.offer_amount AS offerAmount, o.status, o.created_at AS createdAt
    FROM takeovers AS o
    JOIN territories AS t ON t.id = o.territory_id
    JOIN users AS u ON u.id = CASE WHEN o.attacker_id = @id THEN o.defender_id ELSE o.attacker_id END
    WHERE o.attacker_id = @id OR o.defender_id = @id
    ORDER BY o.id DESC LIMIT 30`);
  const connexions = db.prepare<[number], FicheJoueurReponse['logins'][number]>(`
    SELECT ip_hash AS ipHash, ua_hash AS uaHash, created_at AS createdAt
    FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 20`);
  const notes = db.prepare<[number], FicheJoueurReponse['notes'][number]>(`
    SELECT n.id, n.body, a.pseudo AS author, n.created_at AS createdAt, n.updated_at AS updatedAt
    FROM staff_notes AS n LEFT JOIN users AS a ON a.id = n.author_id
    WHERE n.user_id = ? ORDER BY n.id DESC`);
  const journal = db.prepare<
    [string],
    Omit<LigneAudit, 'before' | 'after'> & { before: string | null; after: string | null }
  >(`
    SELECT id, actor_pseudo AS actor, actor_role AS actorRole, action, before_json AS before, after_json AS after,
      reason, created_at AS createdAt
    FROM admin_audit WHERE target_type = 'player' AND target_id = ? ORDER BY id DESC LIMIT 50`);

  app.get(
    '/players/:id',
    { schema: { params: idAdminParamsSchema, response: { 200: ficheJoueurReponseSchema } } },
    (req) => {
      const { id } = req.params;
      const player = cibleOu404(id);
      const now = Math.floor(Date.now() / 1000);
      return {
        player: { ...player, incomePerHour: revenuDuJoueur([...lireRevenus(id).values()], now) },
        communes: communes.all(id).map((c) => ({ ...c, isCapital: c.isCapital === 1 })),
        transactions: transactions.all(id),
        takeovers: opa.all({ id }),
        logins: connexions.all(id),
        notes: notes.all(id),
        audit: journal.all(String(id)).map((l) => ({
          ...l,
          before: l.before ? JSON.parse(l.before) : null,
          after: l.after ? JSON.parse(l.after) : null,
        })),
      };
    },
  );

  // Notes : modérateur et admin.
  const ajouterNote = db.prepare<[number, number, string], number>(
    'INSERT INTO staff_notes (user_id, author_id, body) VALUES (?, ?, ?) RETURNING id',
  );
  const lireNote = db.prepare<[number], { userId: number; body: string }>(
    'SELECT user_id AS userId, body FROM staff_notes WHERE id = ?',
  );
  const changerNote = db.prepare<[string, number]>(
    'UPDATE staff_notes SET body = ?, updated_at = unixepoch() WHERE id = ?',
  );
  const effacerNote = db.prepare<[number]>('DELETE FROM staff_notes WHERE id = ?');
  const noteOu404 = (id: number) => {
    const note = lireNote.get(id);
    if (!note) throw new ErreurMetier('NOT_FOUND', 404, 'Note introuvable.');
    return note;
  };

  app.post('/players/:id/notes', { schema: { params: idAdminParamsSchema, body: noteCorpsSchema } }, (req, reply) => {
    const acteur = acteurDe(req);
    db.transaction(() => {
      cibleOu404(req.params.id);
      const id = ajouterNote.pluck().get(req.params.id, acteur.id, req.body.body) as number;
      auditer(acteur, { action: 'note.add', cible: { type: 'player', id: req.params.id }, apres: { note: id } });
    }).immediate();
    return reply.code(204).send();
  });

  app.patch('/notes/:id', { schema: { params: idAdminParamsSchema, body: noteCorpsSchema } }, (req, reply) => {
    const acteur = acteurDe(req);
    db.transaction(() => {
      const note = noteOu404(req.params.id);
      changerNote.run(req.body.body, req.params.id);
      auditer(acteur, {
        action: 'note.edit',
        cible: { type: 'player', id: note.userId },
        avant: { body: note.body },
        apres: { body: req.body.body },
      });
    }).immediate();
    return reply.code(204).send();
  });

  app.delete('/notes/:id', { schema: { params: idAdminParamsSchema } }, (req, reply) => {
    const acteur = acteurDe(req);
    db.transaction(() => {
      const note = noteOu404(req.params.id);
      effacerNote.run(req.params.id);
      auditer(acteur, {
        action: 'note.delete',
        cible: { type: 'player', id: note.userId },
        avant: { body: note.body },
      });
    }).immediate();
    return reply.code(204).send();
  });

  // Suspension : modérateur et admin. Le joueur se connecte et regarde, mais n'agit plus.
  const suspendre = db.prepare<[number | null, string | null, number]>(
    'UPDATE users SET suspended_until = ?, suspension_reason = ?, updated_at = unixepoch() WHERE id = ?',
  );

  app.post(
    '/players/:id/suspend',
    { schema: { params: idAdminParamsSchema, body: suspendreCorpsSchema } },
    (req, reply) => {
      const acteur = acteurDe(req);
      const { hours, reason } = req.body;
      db.transaction(() => {
        const cible = cibleAutorisee(acteur, req.params.id);
        const fin = Math.floor(Date.now() / 1000) + hours * 3600;
        suspendre.run(fin, reason, cible.id);
        auditer(acteur, {
          action: 'player.suspend',
          cible: { type: 'player', id: cible.id },
          avant: { suspendedUntil: cible.suspendedUntil },
          apres: { suspendedUntil: fin, hours },
          motif: reason,
        });
      }).immediate();
      return reply.code(204).send();
    },
  );

  app.post(
    '/players/:id/unsuspend',
    { schema: { params: idAdminParamsSchema, body: motifCorpsSchema } },
    (req, reply) => {
      const acteur = acteurDe(req);
      db.transaction(() => {
        const cible = cibleAutorisee(acteur, req.params.id);
        suspendre.run(null, null, cible.id);
        auditer(acteur, {
          action: 'player.unsuspend',
          cible: { type: 'player', id: cible.id },
          avant: { suspendedUntil: cible.suspendedUntil },
          motif: req.body.reason,
        });
      }).immediate();
      return reply.code(204).send();
    },
  );

  // Bannissement : admin. Le compte ne se connecte plus (sessions effacées, lireSession refuse « banned »).
  const changerStatut = db.prepare<[string, number]>(
    'UPDATE users SET status = ?, updated_at = unixepoch() WHERE id = ?',
  );
  const effacerSessions = db.prepare<[number]>('DELETE FROM sessions WHERE user_id = ?');

  for (const [chemin, statut] of [
    ['ban', 'banned'],
    ['unban', 'active'],
  ] as const) {
    app.post(
      `/players/:id/${chemin}`,
      { schema: { params: idAdminParamsSchema, body: motifCorpsSchema } },
      (req, reply) => {
        const acteur = exigerAdmin(req);
        db.transaction(() => {
          const cible = cibleAutorisee(acteur, req.params.id);
          changerStatut.run(statut, cible.id);
          if (statut === 'banned') effacerSessions.run(cible.id);
          auditer(acteur, {
            action: `player.${chemin}`,
            cible: { type: 'player', id: cible.id },
            avant: { status: cible.status },
            apres: { status: statut },
            motif: req.body.reason,
          });
        }).immediate();
        return reply.code(204).send();
      },
    );
  }

  // Grade : admin. On ne donne jamais plus haut que le sien.
  const retirerGrade = db.prepare<[number]>('DELETE FROM staff_roles WHERE user_id = ?');
  const donnerGrade = db.prepare<[number, string, number]>(`
    INSERT INTO staff_roles (user_id, role, granted_by) VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, granted_at = unixepoch()`);

  app.put('/players/:id/role', { schema: { params: idAdminParamsSchema, body: roleCorpsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    const { role, reason } = req.body;
    db.transaction(() => {
      const cible = cibleAutorisee(acteur, req.params.id);
      if (role === 'player') retirerGrade.run(cible.id);
      else donnerGrade.run(cible.id, role, acteur.id);
      auditer(acteur, {
        action: 'player.role',
        cible: { type: 'player', id: cible.id },
        avant: { role: cible.role },
        apres: { role },
        motif: reason,
      });
    }).immediate();
    return reply.code(204).send();
  });

  // Reset partiel : admin. Communes, bâtiments et OPA en cours partent ; l'argent reste.
  const libererBiens = creerLiberationBiens(db);
  const encaisser = creerEncaisseur(db);

  app.post('/players/:id/reset', { schema: { params: idAdminParamsSchema, body: motifCorpsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    db.transaction(() => {
      const cible = cibleAutorisee(acteur, req.params.id);
      const maintenant = Math.floor(Date.now() / 1000);
      // Les revenus gagnés jusqu'ici lui reviennent avant que ses communes partent.
      encaisser(cible.id, maintenant);
      const communesLiberees = libererBiens(cible.id, maintenant);
      auditer(acteur, {
        action: 'player.reset',
        cible: { type: 'player', id: cible.id },
        avant: { territories: communesLiberees },
        apres: { territories: 0 },
        motif: req.body.reason,
      });
    }).immediate();
    return reply.code(204).send();
  });

  // Ajustement du solde : admin, par wallet.apply (journal des transactions).
  app.post(
    '/players/:id/adjust',
    { schema: { params: idAdminParamsSchema, body: ajusterCorpsSchema } },
    (req, reply) => {
      const acteur = exigerAdmin(req);
      const { currency, amount, reason } = req.body;
      db.transaction(() => {
        const cible = cibleAutorisee(acteur, req.params.id);
        const avant = currency === 'cash' ? cible.cash : cible.gems;
        const { balance } = wallet.apply(db, {
          userId: cible.id,
          currency,
          amount,
          reason: 'admin_adjustment',
          metadata: { by: acteur.id, reason },
        });
        auditer(acteur, {
          action: 'player.adjust',
          cible: { type: 'player', id: cible.id },
          avant: { [currency]: avant },
          apres: { [currency]: balance, amount },
          motif: reason,
        });
      }).immediate();
      return reply.code(204).send();
    },
  );
};
