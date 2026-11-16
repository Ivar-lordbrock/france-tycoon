import { modifierMoiCorpsSchema, moiReponseSchema } from '@france-tycoon/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErreurMetier } from '../../erreurs.ts';
import { exigerJoueur } from '../auth/requete.ts';
import { lireMoi } from './requetes.ts';

/** Routes 🔒 /me : mon profil et mon portefeuille. */
export const routesMoi: FastifyPluginAsyncZod = async (app) => {
  const pseudoPris = app.db
    .prepare<[string, number], number>('SELECT 1 FROM users WHERE pseudo = ? AND id <> ?')
    .pluck();
  const modifier = app.db.prepare<{ id: number; pseudo: string | null; couleur: string | null }>(`
    UPDATE users SET
      pseudo = coalesce(@pseudo, pseudo),
      marker_color = coalesce(@couleur, marker_color),
      updated_at = unixepoch()
    WHERE id = @id`);

  app.get('/', { schema: { response: { 200: moiReponseSchema } } }, (req) => lireMoi(app.db, exigerJoueur(req)));

  app.patch('/', { schema: { body: modifierMoiCorpsSchema, response: { 200: moiReponseSchema } } }, (req) => {
    const id = exigerJoueur(req);
    const { pseudo, markerColor } = req.body;
    app.db
      .transaction(() => {
        if (pseudo !== undefined && pseudoPris.get(pseudo, id)) {
          throw new ErreurMetier('PSEUDO_TAKEN', 409, `Le pseudo « ${pseudo} » est déjà pris.`);
        }
        modifier.run({ id, pseudo: pseudo ?? null, couleur: markerColor?.toLowerCase() ?? null });
      })
      .immediate();
    return lireMoi(app.db, id);
  });
};
