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
  if (!reponse.ok) throw await erreurDe(reponse);
  return (await reponse.json()) as T;
}

/** Lit une erreur au format commun, ou en fabrique une à partir du statut HTTP. */
async function erreurDe(reponse: Response): Promise<ErreurApi> {
  const corps: unknown = await reponse.json().catch(() => null);
  const erreur = erreurApiSchema.safeParse(corps);
  if (erreur.success) return new ErreurApi(reponse.status, erreur.data.error.code, erreur.data.error.message);
  return new ErreurApi(reponse.status, 'HTTP_ERROR', `Le serveur a répondu ${reponse.status}.`);
}

export interface OptionsEnvoi {
  /** En-tête `Idempotency-Key` : renvoyer la même clé ne fait pas payer deux fois (docs/04 § 4.1). */
  cle?: string;
  appel?: typeof fetch;
}

/** POST / PATCH / DELETE JSON ; `undefined` pour une réponse 204. Le cookie de session part tout seul (même origine). */
export async function envoyerJson<T>(
  url: string,
  methode: 'POST' | 'PATCH' | 'DELETE',
  corps?: unknown,
  { cle, appel = fetch }: OptionsEnvoi = {},
): Promise<T> {
  const reponse = await appel(url, {
    method: methode,
    headers: {
      accept: 'application/json',
      ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cle ? { 'idempotency-key': cle } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!reponse.ok) throw await erreurDe(reponse);
  return (reponse.status === 204 ? undefined : await reponse.json()) as T;
}

/** Clé d'idempotence : une par action voulue (un clic sur « Confirmer »), réutilisée si on réessaie. */
export function nouvelleCle(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Hors HTTPS (et hors localhost), randomUUID n'existe pas : 16 octets au hasard suffisent.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (o) => o.toString(16).padStart(2, '0')).join('');
}

/** Message à montrer au joueur : celui du serveur (déjà en français), sinon une phrase simple. */
export function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurApi) return erreur.message;
  return 'Le serveur ne répond pas. Vérifie ta connexion, puis réessaie.';
}
