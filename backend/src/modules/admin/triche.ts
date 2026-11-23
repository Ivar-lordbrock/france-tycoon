import {
  alertesReponseSchema,
  classerAlerteCorpsSchema,
  exportParamsSchema,
  FUSEAU_JEU,
  type JournalActiviteReponse,
  type JournalAuditReponse,
  type JournalErreursReponse,
  journalActiviteReponseSchema,
  journalAuditReponseSchema,
  journalErreursReponseSchema,
  journalQuerySchema,
  type LigneAlerte,
  TRICHE_IP_JOURS,
  TRICHE_OPA_JOURS,
  TRICHE_OPA_MIN,
  TRICHE_SOLDE_JOURS,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { acteurDe, creerAudit, exigerAdmin } from './audit.ts';

// Anti-triche, journaux et export CSV (étape 7). Les alertes ne sont pas stockées : on les recalcule
// à chaque lecture depuis les connexions, le registre de l'argent et les OPA ; on garde seulement le classement.

const JOUR_S = 86_400;
const maintenant = () => Math.floor(Date.now() / 1000);
type Devise = 'cash' | 'gems';

/** Les 3 règles. Renvoie les alertes du moment : non classées d'abord, puis les plus récentes. */
export function creerDetecteurTriche(db: Base) {
  const ipPartagees = db.prepare<[number], { ip: string; ids: string; at: number }>(`
    SELECT ip_hash AS ip, group_concat(DISTINCT user_id) AS ids, max(created_at) AS at
    FROM login_events WHERE created_at >= ?
    GROUP BY ip_hash HAVING count(DISTINCT user_id) >= 2`);
  // Avant chaque mouvement, le solde doit être celui laissé par le mouvement précédent (0 au premier).
  const sauts = db.prepare<[number], { id: number; userId: number; currency: Devise; saut: number; at: number }>(`
    SELECT * FROM (
      SELECT t.id, t.user_id AS userId, t.currency, t.created_at AS at,
        t.balance_after - t.amount - coalesce((
          SELECT p.balance_after FROM wallet_transactions AS p
          WHERE p.user_id = t.user_id AND p.currency = t.currency AND p.id < t.id
          ORDER BY p.id DESC LIMIT 1), 0) AS saut
      FROM wallet_transactions AS t WHERE t.created_at >= ?)
    WHERE saut > 0`);
  // Et le solde du compte doit être celui laissé par le dernier mouvement.
  // shortcut: lit tous les comptes à chaque appel ; passer par une tâche planifiée au-delà de quelques milliers.
  const ecarts = db.prepare<[], { userId: number; currency: Devise; saut: number; dernier: number }>(`
    SELECT s.user_id AS userId, s.currency, s.solde - coalesce(d.balance_after, 0) AS saut, coalesce(d.id, 0) AS dernier
    FROM (SELECT id AS user_id, 'cash' AS currency, cash AS solde FROM users WHERE status <> 'deleted'
          UNION ALL
          SELECT id, 'gems', premium_currency FROM users WHERE status <> 'deleted') AS s
    LEFT JOIN wallet_transactions AS d ON d.id = (
      SELECT max(w.id) FROM wallet_transactions AS w WHERE w.user_id = s.user_id AND w.currency = s.currency)
    WHERE s.solde - coalesce(d.balance_after, 0) > 0`);
  const opaRepetees = db.prepare<[number, number], { a: number; b: number; n: number; dernier: number; at: number }>(`
    SELECT min(attacker_id, defender_id) AS a, max(attacker_id, defender_id) AS b,
      count(*) AS n, max(id) AS dernier, max(created_at) AS at
    FROM takeovers WHERE created_at >= ?
    GROUP BY a, b HAVING n >= ?`);
  const pseudos = db.prepare<[string], { id: number; pseudo: string }>(
    'SELECT id, pseudo FROM users WHERE id IN (SELECT value FROM json_each(?))',
  );
  const revues = db.prepare<[string], { key: string; note: string; by: string | null; at: number }>(`
    SELECT r.alert_key AS key, r.note, u.pseudo AS by, r.reviewed_at AS at
    FROM cheat_reviews AS r LEFT JOIN users AS u ON u.id = r.reviewed_by
    WHERE r.alert_key IN (SELECT value FROM json_each(?))`);

  return (now: number): LigneAlerte[] => {
    type Brute = Omit<LigneAlerte, 'players' | 'review'> & { ids: number[] };
    const brutes: Brute[] = [];
    for (const l of ipPartagees.all(now - TRICHE_IP_JOURS * JOUR_S)) {
      const ids = l.ids
        .split(',')
        .map(Number)
        .sort((x, y) => x - y);
      const cle = `ip:${l.ip}:${ids.length}:${ids.at(-1)}`;
      brutes.push({ key: cle, rule: 'shared_ip', ids, count: ids.length, currency: null, at: l.at });
    }
    for (const s of sauts.all(now - TRICHE_SOLDE_JOURS * JOUR_S)) {
      brutes.push({
        key: `solde:${s.id}`,
        rule: 'balance_jump',
        ids: [s.userId],
        count: s.saut,
        currency: s.currency,
        at: s.at,
      });
    }
    for (const e of ecarts.all()) {
      const cle = `solde:${e.userId}:${e.currency}:${e.dernier}`;
      brutes.push({ key: cle, rule: 'balance_jump', ids: [e.userId], count: e.saut, currency: e.currency, at: now });
    }
    for (const o of opaRepetees.all(now - TRICHE_OPA_JOURS * JOUR_S, TRICHE_OPA_MIN)) {
      const cle = `opa:${o.a}-${o.b}:${o.dernier}`;
      brutes.push({ key: cle, rule: 'repeat_takeovers', ids: [o.a, o.b], count: o.n, currency: null, at: o.at });
    }
    if (brutes.length === 0) return [];

    const noms = new Map(pseudos.all(JSON.stringify(brutes.flatMap((b) => b.ids))).map((p) => [p.id, p.pseudo]));
    const classees = new Map(revues.all(JSON.stringify(brutes.map((b) => b.key))).map((r) => [r.key, r]));
    return brutes
      .map(({ ids, ...b }) => {
        const r = classees.get(b.key);
        return {
          ...b,
          players: ids.map((id) => ({ id, pseudo: noms.get(id) ?? `n° ${id}` })),
          review: r ? { by: r.by, note: r.note, at: r.at } : null,
        };
      })
      .sort((x, y) => Number(x.review !== null) - Number(y.review !== null) || y.at - x.at);
  };
}

type Cellule = string | number | null;

/** Cellule CSV. Un texte qui commence par = + - @ est neutralisé (pas de formule à l'ouverture dans Excel). */
function cellule(v: Cellule): string {
  if (v === null) return '';
  if (typeof v === 'number') return String(v);
  const texte = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

/** CSV pour Excel en français : « ; » entre les colonnes, BOM pour les accents. */
export function versCsv(entetes: string[], lignes: Cellule[][]): string {
  return `﻿${[entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`;
}

/** « 2026-11-23 21:55:00 », heure de Paris. */
const dateCsv = (s: number | null) =>
  s === null ? null : new Date(s * 1000).toLocaleString('sv-SE', { timeZone: FUSEAU_JEU });

export const routesAdminTriche: FastifyPluginAsyncZod<{ adminEmails?: readonly string[] }> = async (
  app,
  { adminEmails = [] },
) => {
  const db = app.db;
  const auditer = creerAudit(db);
  const alertes = creerDetecteurTriche(db);
  const classer = db.prepare<[string, string, number]>(
    'INSERT INTO cheat_reviews (alert_key, note, reviewed_by) VALUES (?, ?, ?)',
  );

  app.get('/cheat-alerts', { schema: { response: { 200: alertesReponseSchema } } }, (req) => {
    acteurDe(req);
    return { alerts: alertes(maintenant()) };
  });

  app.post('/cheat-alerts/review', { schema: { body: classerAlerteCorpsSchema } }, (req, reply) => {
    const acteur = acteurDe(req);
    const { key, note } = req.body;
    db.transaction(() => {
      const alerte = alertes(maintenant()).find((a) => a.key === key);
      if (!alerte) throw new ErreurMetier('NOT_FOUND', 404, 'Cette alerte n’existe plus : les faits ont changé.');
      if (alerte.review) throw new ErreurMetier('VALIDATION_ERROR', 409, 'Cette alerte est déjà classée.');
      classer.run(key, note, acteur.id);
      auditer(acteur, {
        action: 'alert.review',
        cible: { type: 'alert', id: key },
        apres: { rule: alerte.rule, players: alerte.players.map((p) => p.pseudo).join(', ') },
        motif: note,
      });
    }).immediate();
    return reply.code(204).send();
  });

  // Journaux : les 100 plus récents ; `q` filtre (pseudo ou n° du joueur ; action, auteur ou cible).
  type Activite = Omit<JournalActiviteReponse['rows'][number], 'player'> & { userId: number; pseudo: string };
  const activite = db.prepare<{ q: string }, Activite>(`
    SELECT w.id, w.user_id AS userId, u.pseudo, w.currency, w.amount, w.balance_after AS balanceAfter, w.reason,
      w.created_at AS createdAt
    FROM wallet_transactions AS w JOIN users AS u ON u.id = w.user_id
    WHERE @q = '' OR u.pseudo LIKE '%' || @q || '%' OR CAST(u.id AS TEXT) = @q
    ORDER BY w.id DESC LIMIT 100`);
  type Audit = Omit<JournalAuditReponse['rows'][number], 'before' | 'after'> & {
    before: string | null;
    after: string | null;
  };
  const audit = db.prepare<{ q: string }, Audit>(`
    SELECT id, actor_pseudo AS actor, actor_role AS actorRole, action, target_type AS targetType,
      target_id AS targetId, before_json AS before, after_json AS after, reason, created_at AS createdAt
    FROM admin_audit
    WHERE @q = '' OR action LIKE @q || '%' OR actor_pseudo LIKE '%' || @q || '%' OR target_id = @q
    ORDER BY id DESC LIMIT 100`);
  const erreurs = db.prepare<[], JournalErreursReponse['rows'][number]>(`
    SELECT 'api' AS source, method || ' ' || route AS place, message, created_at AS at FROM app_errors
    UNION ALL
    SELECT 'job', job_name, coalesce(details, 'Erreur sans détail'), started_at FROM job_runs WHERE status = 'error'
    ORDER BY at DESC LIMIT 100`);

  const journal = { schema: { querystring: journalQuerySchema } };
  app.get(
    '/logs/activity',
    { schema: { ...journal.schema, response: { 200: journalActiviteReponseSchema } } },
    (req) => {
      acteurDe(req);
      const rows = activite.all({ q: req.query.q }).map(({ userId, pseudo, ...l }) => ({
        ...l,
        player: { id: userId, pseudo },
      }));
      return { rows };
    },
  );
  app.get('/logs/audit', { schema: { ...journal.schema, response: { 200: journalAuditReponseSchema } } }, (req) => {
    acteurDe(req);
    const rows = audit.all({ q: req.query.q }).map((l) => ({
      ...l,
      before: l.before ? JSON.parse(l.before) : null,
      after: l.after ? JSON.parse(l.after) : null,
    }));
    return { rows };
  });
  app.get('/logs/errors', { schema: { response: { 200: journalErreursReponseSchema } } }, (req) => {
    acteurDe(req);
    return { rows: erreurs.all() };
  });

  // Exports : tout l'historique, sauf l'activité (30 jours). Admins seulement : les e-mails sont dedans.
  // shortcut: fichier construit en mémoire et plafonné à 100 000 lignes ; passer en flux au-delà.
  const joueurs = db.prepare<
    [],
    { id: number; pseudo: string; email: string; role: string; status: string; suspendu: number | null } & {
      cash: number;
      gems: number;
      communes: number;
      inscrit: number;
      actif: number | null;
    }
  >(`
    SELECT u.id, u.pseudo, u.email, coalesce(s.role, 'player') AS role, u.status, u.suspended_until AS suspendu,
      u.cash, u.premium_currency AS gems, (SELECT count(*) FROM territories AS t WHERE t.owner_id = u.id) AS communes,
      u.created_at AS inscrit, u.last_active_at AS actif
    FROM users AS u LEFT JOIN staff_roles AS s ON s.user_id = u.id ORDER BY u.id LIMIT 100000`);
  const auditComplet = db.prepare<[], Omit<Audit, 'actorRole'> & { actorRole: string }>(`
    SELECT id, created_at AS createdAt, actor_pseudo AS actor, actor_role AS actorRole, action,
      target_type AS targetType, target_id AS targetId, before_json AS before, after_json AS after, reason
    FROM admin_audit ORDER BY id LIMIT 100000`);
  const activiteMois = db.prepare<[number], Activite>(`
    SELECT w.id, w.created_at AS createdAt, w.user_id AS userId, u.pseudo, w.currency, w.amount,
      w.balance_after AS balanceAfter, w.reason
    FROM wallet_transactions AS w JOIN users AS u ON u.id = w.user_id
    WHERE w.created_at >= ? ORDER BY w.id LIMIT 100000`);

  const EXPORTS: Record<(typeof exportParamsSchema.shape.quoi.options)[number], () => [string[], Cellule[][]]> = {
    players: () => [
      [
        'n°',
        'pseudo',
        'e-mail',
        'grade',
        'statut',
        'suspendu jusqu’au',
        '₮',
        'gemmes',
        'communes',
        'inscrit le',
        'actif le',
      ],
      joueurs
        .all()
        .map((j) => [
          j.id,
          j.pseudo,
          j.email,
          adminEmails.includes(j.email.toLowerCase()) ? 'admin' : j.role,
          j.status,
          dateCsv(j.suspendu),
          j.cash,
          j.gems,
          j.communes,
          dateCsv(j.inscrit),
          dateCsv(j.actif),
        ]),
    ],
    audit: () => [
      ['n°', 'quand', 'qui', 'grade', 'action', 'cible', 'n° cible', 'avant', 'après', 'motif'],
      auditComplet
        .all()
        .map((l) => [
          l.id,
          dateCsv(l.createdAt),
          l.actor,
          l.actorRole,
          l.action,
          l.targetType,
          l.targetId,
          l.before,
          l.after,
          l.reason,
        ]),
    ],
    activity: () => [
      ['n°', 'quand', 'n° joueur', 'pseudo', 'devise', 'montant', 'solde après', 'raison'],
      activiteMois
        .all(maintenant() - 30 * JOUR_S)
        .map((l) => [l.id, dateCsv(l.createdAt), l.userId, l.pseudo, l.currency, l.amount, l.balanceAfter, l.reason]),
    ],
  };

  app.get('/export/:quoi', { schema: { params: exportParamsSchema } }, (req, reply) => {
    const acteur = exigerAdmin(req);
    const { quoi } = req.params;
    const [entetes, lignes] = EXPORTS[quoi]();
    db.transaction(() =>
      auditer(acteur, { action: 'export.csv', cible: { type: 'export', id: quoi }, apres: { rows: lignes.length } }),
    ).immediate();
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: FUSEAU_JEU });
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="kadastr-${quoi}-${jour}.csv"`)
      .header('cache-control', 'no-store')
      .send(versCsv(entetes, lignes));
  });
};
