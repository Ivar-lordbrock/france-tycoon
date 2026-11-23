import {
  erreurApiSchema,
  ficheCommuneSchema,
  listeCommunesAdminReponseSchema,
  listeOpaAdminReponseSchema,
  opaReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type App, construireApp } from '../../app.ts';
import { baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

const jour = 86_400;
const maintenant = () => Math.floor(Date.now() / 1000);

/** « Chef » admin d'office, « Modo » modérateur ; Alice (100 000 ₮) peut lancer une OPA sur le village de Bruno. */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const app = construireApp({ db, auth: { devLogin: true }, adminEmails: ['chef@dev.invalid'] });
  const chef = await connecter(app, 'Chef');
  const modo = await connecter(app, 'Modo');
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);
  db.prepare('UPDATE users SET created_at = ?, newbie_shield_until = 0').run(maintenant() - 8 * jour);
  db.prepare("UPDATE users SET cash = 100000 WHERE pseudo = 'Alice'").run();
  db.prepare("UPDATE territories SET owner_id = ? WHERE insee_code = '01001'").run(bruno.id);
  return { app, chef, modo, alice, bruno };
}

const appel = (app: App, cookie: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1/${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

const motif = { reason: 'Test de modération' };
const cashDe = (app: App, id: number) => app.db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(id);
const nbAudit = (app: App, action: string) =>
  app.db.prepare('SELECT count(*) FROM admin_audit WHERE action = ?').pluck().get(action);

async function lancerOpa(app: App, cookie: string) {
  const reponse = await appel(app, cookie, 'POST', 'territories/01001/takeovers');
  expect(reponse.statusCode).toBe(200);
  return opaReponseSchema.parse(reponse.json()).takeover;
}

describe('dashboard /admin : vue Territoires et OPA', () => {
  it('recherche par nom sans accents et filtres ; lecture pour le modérateur, refusée au joueur', async () => {
    const { app, modo, alice, bruno } = await partie();
    const liste = async (requete: string) =>
      listeCommunesAdminReponseSchema.parse(
        (await appel(app, modo.cookie, 'GET', `admin/territories${requete}`)).json(),
      ).territories;

    expect(await liste('?q=abergement')).toMatchObject([
      { insee: '01001', owner: { id: bruno.id, pseudo: 'Bruno' }, forcedPrice: null, takeoverPending: false },
    ]);
    expect((await liste('?q=01004')).map((c) => c.insee)).toEqual(['01004']);
    expect((await liste('?filter=free')).map((c) => c.insee)).toEqual(['01004']);
    expect((await liste('')).map((c) => c.insee)).toEqual(['01004', '01001']); // plus peuplée d'abord
    expect((await appel(app, alice.cookie, 'GET', 'admin/territories')).statusCode).toBe(403);
  });

  it('prix forcé : l’achat paie le prix forcé, puis retour au calcul auto ; admin seulement', async () => {
    const { app, chef, modo, alice } = await partie();
    const forcer = (cookie: string, price: number | null, insee = '01004') =>
      appel(app, cookie, 'PUT', `admin/territories/${insee}/price`, { price, ...motif });

    const refus = await forcer(modo.cookie, 1234);
    expect(refus.statusCode).toBe(403);
    expect(erreurApiSchema.parse(refus.json()).error.message).toBe('Réservé aux admins.');
    expect((await forcer(chef.cookie, 1234, '99999')).statusCode).toBe(404);

    expect((await forcer(chef.cookie, 1234)).statusCode).toBe(204);
    const fiche = ficheCommuneSchema.parse((await appel(app, alice.cookie, 'GET', 'territories/01004')).json());
    expect(fiche.actions.buyPrice).toBe(1234);
    const forcees = listeCommunesAdminReponseSchema.parse(
      (await appel(app, modo.cookie, 'GET', 'admin/territories?filter=forced')).json(),
    ).territories;
    expect(forcees).toMatchObject([{ insee: '01004', forcedPrice: 1234, forcedReason: 'Test de modération' }]);

    expect((await appel(app, alice.cookie, 'POST', 'territories/01004/buy')).statusCode).toBe(200);
    expect(cashDe(app, alice.id)).toBe(100_000 - 1234);

    expect((await forcer(chef.cookie, null)).statusCode).toBe(204);
    expect(app.db.prepare("SELECT forced_price FROM territories WHERE insee_code = '01004'").pluck().get()).toBeNull();
    expect(nbAudit(app, 'territory.price')).toBe(2);
  });

  it('annuler une OPA rend toute l’offre à l’attaquant ; une seule fois', async () => {
    const { app, chef, modo, alice, bruno } = await partie();
    const opa = await lancerOpa(app, alice.cookie);
    expect(cashDe(app, alice.id)).toBe(100_000 - opa.offerAmount);

    const enCours = listeOpaAdminReponseSchema.parse((await appel(app, modo.cookie, 'GET', 'admin/takeovers')).json());
    expect(enCours.takeovers).toMatchObject([{ id: opa.id, attacker: 'Alice', defender: 'Bruno', status: 'pending' }]);
    expect((await appel(app, modo.cookie, 'POST', `admin/takeovers/${opa.id}/cancel`, motif)).statusCode).toBe(403);

    expect((await appel(app, chef.cookie, 'POST', `admin/takeovers/${opa.id}/cancel`, motif)).statusCode).toBe(204);
    expect(cashDe(app, alice.id)).toBe(100_000);
    expect(app.db.prepare("SELECT owner_id FROM territories WHERE insee_code = '01001'").pluck().get()).toBe(bruno.id);

    const encore = await appel(app, chef.cookie, 'POST', `admin/takeovers/${opa.id}/cancel`, motif);
    expect(encore.statusCode).toBe(409);
    expect(erreurApiSchema.parse(encore.json()).error.code).toBe('TAKEOVER_NOT_PENDING');
    expect((await appel(app, chef.cookie, 'POST', 'admin/takeovers/999/cancel', motif)).statusCode).toBe(404);
    expect(nbAudit(app, 'takeover.cancel')).toBe(1);
  });

  it('forcer une OPA donne tout de suite la commune à l’attaquant, et l’offre au défenseur', async () => {
    const { app, chef, alice, bruno } = await partie();
    const opa = await lancerOpa(app, alice.cookie);
    const cashBruno = cashDe(app, bruno.id) as number;

    expect((await appel(app, chef.cookie, 'POST', `admin/takeovers/${opa.id}/force`, motif)).statusCode).toBe(204);
    expect(app.db.prepare("SELECT owner_id FROM territories WHERE insee_code = '01001'").pluck().get()).toBe(alice.id);
    expect(cashDe(app, bruno.id)).toBeGreaterThanOrEqual(cashBruno + opa.offerAmount);

    const reussies = listeOpaAdminReponseSchema.parse(
      (await appel(app, chef.cookie, 'GET', 'admin/takeovers?status=succeeded')).json(),
    );
    expect(reussies.takeovers.map((o) => o.id)).toEqual([opa.id]);
    expect(nbAudit(app, 'takeover.force')).toBe(1);
  });
});
