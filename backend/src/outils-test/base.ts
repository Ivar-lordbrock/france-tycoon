import { construireApp, type OptionsApp } from '../app.ts';
import { type Base, ouvrirBase } from '../db/connexion.ts';
import { appliquerMigrations } from '../db/migrations.ts';

/** Base en mémoire avec toutes les migrations : une par test, rien ne fuit entre les tests. */
export function baseDeTest(): Base {
  const db = ouvrirBase(':memory:');
  appliquerMigrations(db);
  return db;
}

/** Application de test ; la connexion de développement est active sauf si `auth` dit le contraire. */
export function appDeTest(db: Base = baseDeTest(), auth: OptionsApp['auth'] = {}) {
  return construireApp({ db, auth: { devLogin: true, ...auth } });
}

type AppDeTest = ReturnType<typeof appDeTest>;

/** Se connecte avec un compte de test et renvoie l'en-tête `cookie` à rejouer, plus l'id du joueur. */
export async function connecter(app: AppDeTest, pseudo: string): Promise<{ cookie: string; id: number }> {
  const reponse = await app.inject({ method: 'POST', url: '/api/v1/auth/dev', payload: { pseudo } });
  if (reponse.statusCode !== 200) throw new Error(`connexion de test refusée : ${reponse.body}`);
  const sid = reponse.cookies.find((c) => c.name === 'sid');
  if (!sid) throw new Error('pas de cookie sid');
  return { cookie: `sid=${sid.value}`, id: reponse.json().user.id };
}
