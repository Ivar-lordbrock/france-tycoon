import type { FastifyPluginAsync } from 'fastify';
import { exigerJoueur } from '../auth/requete.ts';
import { creerDirect } from './direct.ts';

const maintenant = () => Math.floor(Date.now() / 1000);

export interface OptionsDirect {
  /** Temps entre deux passages du flux (1 s par défaut). */
  intervalleMs?: number;
}

/** GET /events 🔒 : le flux en direct du joueur connecté (SSE, docs/04 « Notifications et temps réel »). */
export const routesDirect: FastifyPluginAsync<OptionsDirect> = async (app, { intervalleMs = 1000 }) => {
  const direct = creerDirect(app.db);
  let minuteur: NodeJS.Timeout | null = null;

  function arreter() {
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
  }

  // Le minuteur ne tourne que si quelqu'un écoute.
  function demarrer() {
    if (minuteur) return;
    minuteur = setInterval(() => {
      try {
        direct.tic(maintenant());
      } catch (erreur) {
        app.log.error({ err: erreur }, 'flux en direct : passage en échec');
      }
      if (direct.ecoutants() === 0) arreter();
    }, intervalleMs);
    minuteur.unref();
  }

  // Sans ça, `app.close()` attendrait la fin des connexions ouvertes.
  app.addHook('preClose', async () => {
    arreter();
    direct.fermerTout();
  });

  app.get('/', (req, reply) => {
    const moi = exigerJoueur(req);
    reply.hijack(); // la réponse reste ouverte : on écrit nous-mêmes
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'private, no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // nginx : pas de mise en tampon
    });
    res.write('retry: 5000\n\n'); // reconnexion automatique du navigateur au bout de 5 s
    const debrancher = direct.abonner(moi, {
      ecrire: (texte) => {
        if (!res.writableEnded) res.write(texte);
      },
      fermer: () => res.end(),
    });
    res.on('close', debrancher);
    demarrer();
  });
};
