import { estZoneCode, suiviCorpsSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';
import { emettre } from './bus.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

/** Au plus 60 événements par minute et par joueur (docs/04). */
export const SUIVI_PAR_MINUTE = 60;

/**
 * Route 🔒 POST /events/track : ce que seul l'écran voit (fiche ouverte, zone d'Outre-mer, classement)
 * fait avancer les quêtes et le tutoriel. Réponse 204, sans corps.
 */
export const routesSuivi: FastifyPluginAsyncZod = async (app) => {
  const communeExiste = app.db.prepare<[string], number>('SELECT 1 FROM territories WHERE insee_code = ?').pluck();
  /** Compteur de la minute en cours, par joueur (en mémoire : repart de zéro au redémarrage). */
  const compteurs = new Map<number, { minute: number; nombre: number }>();

  function limiter(moi: number, t: number): void {
    const minute = Math.floor(t / 60);
    const c = compteurs.get(moi);
    if (!c || c.minute !== minute) {
      if (compteurs.size > 10_000) compteurs.clear(); // pas de fuite de mémoire
      compteurs.set(moi, { minute, nombre: 1 });
      return;
    }
    c.nombre += 1;
    if (c.nombre > SUIVI_PAR_MINUTE) throw new ErreurMetier('RATE_LIMITED', 429, 'Trop d’événements : attends un peu.');
  }

  app.post('/track', { schema: { body: suiviCorpsSchema } }, (req, reply) => {
    const moi = exigerJoueur(req);
    const t = maintenant();
    limiter(moi, t);
    const { type, ref } = req.body;
    if (type === 'territory_visited' && communeExiste.get(ref) === undefined) {
      throw new ErreurMetier('NOT_FOUND', 404, 'Commune inconnue.');
    }
    if (type === 'zone_visited' && !estZoneCode(ref)) {
      throw new ErreurMetier('VALIDATION_ERROR', 400, 'Zone inconnue.');
    }
    // « Cap sur l'Outre-mer » : la Métropole ne compte pas. Le classement compte à chaque visite.
    if (!(type === 'zone_visited' && ref === 'MET')) {
      app.db
        .transaction(() =>
          emettre(app.db, { userId: moi, type, ref: type === 'leaderboard_viewed' ? undefined : ref }, t),
        )
        .immediate();
    }
    return reply.code(204).send();
  });
};
