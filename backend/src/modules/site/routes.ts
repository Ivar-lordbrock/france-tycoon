import { type EtatSite, etatSiteSchema, SIGNALEMENTS_PAR_JOUR, signalerCorpsSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';

// État du site (maintenance, bannière) et « Signaler un bug ». L'équipe les règle dans le dashboard /admin.

const maintenant = () => Math.floor(Date.now() / 1000);

/** Maintenance et bannière du moment ; une bannière dont la fin est passée n'est plus montrée. */
export function creerLecteurEtatSite(db: Base) {
  const ligne = db.prepare<[], { maintenance: string | null; text: string | null; until: number | null }>(
    'SELECT maintenance_message AS maintenance, banner_text AS text, banner_until AS until FROM site_status WHERE id = 1',
  );
  return (instant: number): EtatSite => {
    const l = ligne.get();
    if (!l) return { maintenance: null, banner: null };
    const visible = l.text !== null && (l.until === null || l.until > instant);
    return { maintenance: l.maintenance, banner: visible ? { text: l.text as string, until: l.until } : null };
  };
}

export const routesSite: FastifyPluginAsyncZod = async (app) => {
  const db = app.db;
  const lireEtat = creerLecteurEtatSite(db);

  app.get('/status', { schema: { response: { 200: etatSiteSchema } } }, (_req, reply) => {
    reply.header('cache-control', 'no-cache');
    return lireEtat(maintenant());
  });

  const recents = db
    .prepare<[number, number], number>('SELECT count(*) FROM player_reports WHERE user_id = ? AND created_at > ?')
    .pluck();
  const inserer = db.prepare<[number, string, string | null]>(
    'INSERT INTO player_reports (user_id, body, page) VALUES (?, ?, ?)',
  );

  // Permis même suspendu ou en maintenance (`auth/requete.ts`) : c'est justement là qu'on en a besoin.
  app.post('/reports', { schema: { body: signalerCorpsSchema } }, (req, reply) => {
    const moi = exigerJoueur(req);
    db.transaction(() => {
      if ((recents.get(moi, maintenant() - 86_400) ?? 0) >= SIGNALEMENTS_PAR_JOUR) {
        throw new ErreurMetier(
          'RATE_LIMITED',
          429,
          `Tu as déjà envoyé ${SIGNALEMENTS_PAR_JOUR} signalements aujourd’hui. Merci, l’équipe les lit !`,
        );
      }
      inserer.run(moi, req.body.body, req.body.page ?? null);
    }).immediate();
    return reply.code(204).send();
  });
};
