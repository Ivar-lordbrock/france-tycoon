import { erreurApiSchema } from '@france-tycoon/shared';

/** Erreur renvoyée par l'API au format commun `{ error: { code, message } }` (docs/04-api.md). */
export class ErreurApi extends Error {
  readonly statut: number;
  readonly code: string;

  constructor(statut: number, code: string, message: string) {
    super(message);
    this.name = 'ErreurApi';
    this.statut = statut;
    this.code = code;
  }
}

/**
 * GET JSON. Le navigateur gère seul l'ETag : avec `Cache-Control: no-cache`, il revalide
 * (`If-None-Match`) et ressert sa copie sur un 304.
 */
export async function lireJson<T>(url: string, signal?: AbortSignal, appel: typeof fetch = fetch): Promise<T> {
  const reponse = await appel(url, { signal, headers: { accept: 'application/json' } });
  if (!reponse.ok) {
    const corps: unknown = await reponse.json().catch(() => null);
    const erreur = erreurApiSchema.safeParse(corps);
    if (erreur.success) throw new ErreurApi(reponse.status, erreur.data.error.code, erreur.data.error.message);
    throw new ErreurApi(reponse.status, 'HTTP_ERROR', `Le serveur a répondu ${reponse.status}.`);
  }
  return (await reponse.json()) as T;
}
