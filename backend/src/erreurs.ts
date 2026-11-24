import type { CodeErreur, ErreurApi } from '@france-tycoon/shared';
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

/** Erreur prévue par les règles du jeu : renvoyée telle quelle au client. */
export class ErreurMetier extends Error {
  readonly code: CodeErreur;
  readonly statut: number;
  readonly details?: unknown;

  constructor(code: CodeErreur, statut: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ErreurMetier';
    this.code = code;
    this.statut = statut;
    this.details = details;
  }
}

function corps(code: CodeErreur, message: string, details?: unknown): ErreurApi {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Toutes les erreurs sortent au format `{ error: { code, message, details } }`. */
export function brancherGestionErreurs(app: FastifyInstance): void {
  // Erreurs 500 notées pour le dashboard (vue « Anti-triche & logs ») : la route sans paramètres, jamais la requête.
  // Requêtes préparées à la première erreur : ici, les migrations ne sont pas encore passées (server.ts).
  const noterErreur = (requete: FastifyRequest, erreur: Error) => {
    try {
      app.db.transaction(() => {
        app.db
          .prepare('INSERT INTO app_errors (method, route, message) VALUES (?, ?, ?)')
          .run(requete.method, requete.routeOptions.url ?? 'route inconnue', erreur.message.slice(0, 500));
        app.db.prepare('DELETE FROM app_errors WHERE id <= (SELECT max(id) FROM app_errors) - 1000').run();
      })();
    } catch {
      // Base en panne : l'erreur reste dans le journal du serveur.
    }
  };

  app.setErrorHandler<FastifyError | ErreurMetier>((erreur, requete, reponse) => {
    if (erreur instanceof ErreurMetier) {
      return reponse.code(erreur.statut).send(corps(erreur.code, erreur.message, erreur.details));
    }
    if (hasZodFastifySchemaValidationErrors(erreur)) {
      const details = erreur.validation.map((probleme) => ({
        champ: probleme.instancePath.replace(/^\//, '') || erreur.validationContext,
        message: probleme.message,
      }));
      return reponse.code(400).send(corps('VALIDATION_ERROR', 'Requête invalide', details));
    }
    if (isResponseSerializationError(erreur)) {
      requete.log.error({ err: erreur, issues: erreur.cause.issues }, 'réponse non conforme au schéma');
      noterErreur(requete, erreur);
      return reponse.code(500).send(corps('INTERNAL_ERROR', 'Erreur interne'));
    }
    const statut = erreur.statusCode ?? 500;
    if (statut >= 500) {
      requete.log.error({ err: erreur }, 'erreur interne');
      noterErreur(requete, erreur);
      return reponse.code(500).send(corps('INTERNAL_ERROR', 'Erreur interne'));
    }
    if (statut === 429) return reponse.code(429).send(corps('RATE_LIMITED', 'Trop de requêtes'));
    return reponse.code(statut).send(corps('VALIDATION_ERROR', erreur.message));
  });

  app.setNotFoundHandler((requete, reponse) => {
    reponse.code(404).send(corps('NOT_FOUND', `Route inconnue : ${requete.method} ${requete.url.split('?')[0]}`));
  });
}
