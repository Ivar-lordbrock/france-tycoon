import { mkdirSync, readdirSync, renameSync, statfsSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type LigneSauvegarde,
  listeSauvegardesReponseSchema,
  SAUVEGARDES_GARDEES,
  sauvegardeReponseSchema,
} from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { creerAudit, exigerAdmin } from './audit.ts';

// Sauvegardes du dashboard (étape 5) : copie à chaud de la base (API de sauvegarde de SQLite, le jeu
// continue), hors du site et de Git. Restaurer ou télécharger : par SSH seulement (docs/03 § 3.5).

const NOM = /^kadastr-\d{8}-\d{6}-\d{3}\.sqlite$/;
const MARGE_DISQUE = 200 * 1024 * 1024;

/** « kadastr-20261123-205012-345.sqlite » : la date (UTC) dans le nom, donc l'ordre alphabétique est l'ordre du temps. */
const nomPour = (d: Date) =>
  `kadastr-${d.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').slice(0, 19)}.sqlite`;

export const routesAdminSauvegardes: FastifyPluginAsyncZod<{ dossier?: string }> = async (app, { dossier }) => {
  const db = app.db;
  const auditer = creerAudit(db);
  const rep = dossier ?? (db.memory ? null : join(dirname(db.name), 'sauvegardes-admin'));
  const tailleBase = db
    .prepare<[], number>('SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()')
    .pluck();
  let enCours = false;

  const lister = (): LigneSauvegarde[] => {
    if (!rep) return [];
    let noms: string[];
    try {
      noms = readdirSync(rep);
    } catch {
      return []; // dossier pas encore créé
    }
    return noms
      .filter((n) => NOM.test(n))
      .sort()
      .reverse()
      .map((name) => {
        const st = statSync(join(rep, name));
        return { name, bytes: st.size, createdAt: Math.floor(st.mtimeMs / 1000) };
      });
  };

  app.get('/backups', { schema: { response: { 200: listeSauvegardesReponseSchema } } }, () => ({
    backups: lister(),
    directory: rep,
  }));

  app.post('/backups', { schema: { response: { 200: sauvegardeReponseSchema } } }, async (req) => {
    const acteur = exigerAdmin(req);
    if (!rep) throw new ErreurMetier('FEATURE_DISABLED', 404, 'Pas de sauvegarde pour une base en mémoire.');
    if (enCours) throw new ErreurMetier('RATE_LIMITED', 429, 'Une sauvegarde est déjà en cours.');
    enCours = true;
    try {
      mkdirSync(rep, { recursive: true, mode: 0o700 });
      // Ne jamais remplir le disque : le jeu ne pourrait plus écrire.
      const disque = statfsSync(rep);
      if (disque.bavail * disque.bsize < (tailleBase.get() ?? 0) * 2 + MARGE_DISQUE) {
        throw new ErreurMetier('DISK_FULL', 507, 'Pas assez de place sur le disque du serveur pour une copie de plus.');
      }
      for (const n of readdirSync(rep)) if (n.endsWith('.partiel')) unlinkSync(join(rep, n)); // reste d'une copie coupée

      const name = nomPour(new Date());
      const fichier = join(rep, name);
      await db.backup(`${fichier}.partiel`);
      renameSync(`${fichier}.partiel`, fichier);

      const anciennes = lister().slice(SAUVEGARDES_GARDEES);
      for (const a of anciennes) unlinkSync(join(rep, a.name));
      const st = statSync(fichier);
      const backup = { name, bytes: st.size, createdAt: Math.floor(st.mtimeMs / 1000) };
      db.transaction(() =>
        auditer(acteur, {
          action: 'backup.create',
          cible: { type: 'backup', id: name },
          apres: { bytes: backup.bytes, deleted: anciennes.length },
        }),
      ).immediate();
      return { backup, deleted: anciennes.length };
    } finally {
      enCours = false;
    }
  });
};
