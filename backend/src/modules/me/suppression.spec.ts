import { contenuOpaTermineeSchema } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';

const jour = 86_400;
const maintenant = () => Math.floor(Date.now() / 1000);

/** Bruno possède le village (avec une Résidence) et sa capitale Ambérieu ; Alice joue aussi. */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const sql = (requete: string, ...valeurs: unknown[]) => db.prepare(requete).run(...valeurs);
  sql("UPDATE territories SET owner_id = ?, fortification_value = 1000 WHERE insee_code = '01001'", bruno.id);
  sql("UPDATE territories SET owner_id = ?, is_capital = 1 WHERE insee_code = '01004'", bruno.id);
  db.exec(`
    INSERT INTO buildings (territory_id, building_type_id, level, invested_cash)
    SELECT t.id, bt.id, 1, 4430 FROM territories AS t, building_types AS bt
    WHERE t.insee_code = '01001' AND bt.code = 'residence'`);
  const supprimer = (cookie: string) => app.inject({ method: 'DELETE', url: '/api/v1/me', headers: { cookie } });
  const compter = (requete: string, ...valeurs: unknown[]) =>
    db
      .prepare(requete)
      .pluck()
      .get(...valeurs) as number;
  return { db, app, alice, bruno, sql, supprimer, compter };
}

describe('DELETE /api/v1/me', () => {
  it('anonymise le compte, libère ses communes, garde le journal de l’argent', async () => {
    const { db, app, bruno, supprimer, compter } = await partie();
    const mouvementsAvant = compter('SELECT count(*) FROM wallet_transactions WHERE user_id = ?', bruno.id);

    const reponse = await supprimer(bruno.cookie);

    expect(reponse.statusCode).toBe(204);
    expect(reponse.cookies.find((c) => c.name === 'sid')?.value).toBe('');
    const ligne = db
      .prepare('SELECT status, pseudo, google_id AS googleId, email, avatar_url AS avatar FROM users WHERE id = ?')
      .get(bruno.id);
    expect(ligne).toEqual({
      status: 'deleted',
      pseudo: `Joueur supprimé #${bruno.id}`,
      googleId: `deleted:${bruno.id}`,
      email: expect.stringMatching(/^deleted:[0-9a-f]{64}$/),
      avatar: null,
    });
    // Communes libres, bâtiments détruits, capitale retirée, changement noté dans l'historique.
    expect(compter('SELECT count(*) FROM territories WHERE owner_id = ?', bruno.id)).toBe(0);
    expect(compter('SELECT count(*) FROM territories WHERE is_capital = 1 OR fortification_value > 0')).toBe(0);
    expect(compter('SELECT count(*) FROM buildings')).toBe(0);
    expect(
      compter(
        "SELECT count(*) FROM territory_ownership_history WHERE from_user_id = ? AND to_user_id IS NULL AND reason = 'admin'",
        bruno.id,
      ),
    ).toBe(2);
    expect(compter('SELECT count(*) FROM wallet_transactions WHERE user_id = ?', bruno.id)).toBe(mouvementsAvant);
    // Déconnecté partout, messages effacés.
    expect(compter('SELECT count(*) FROM sessions WHERE user_id = ?', bruno.id)).toBe(0);
    expect(compter('SELECT count(*) FROM notifications WHERE user_id = ?', bruno.id)).toBe(0);
    const moi = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: bruno.cookie } });
    expect(moi.statusCode).toBe(401);
    // Plus de profil public.
    const profil = await app.inject({ method: 'GET', url: `/api/v1/players/${encodeURIComponent('Bruno')}` });
    expect(profil.statusCode).toBe(404);
  });

  it('les OPA en cours sont annulées : l’attaquant récupère son offre, sans le pseudo supprimé', async () => {
    const { db, app, alice, bruno, sql, supprimer } = await partie();
    sql(
      "UPDATE users SET created_at = ?, newbie_shield_until = 0, cash = 100000 WHERE pseudo IN ('Alice', 'Bruno')",
      maintenant() - 30 * jour,
    );
    const lancement = await app.inject({
      method: 'POST',
      url: '/api/v1/territories/01001/takeovers',
      headers: { cookie: alice.cookie },
    });
    expect(lancement.statusCode).toBe(200);
    const offre = lancement.json().takeover.offerAmount as number;

    expect((await supprimer(bruno.cookie)).statusCode).toBe(204);

    expect(db.prepare('SELECT status FROM takeovers WHERE attacker_id = ?').pluck().all(alice.id)).toEqual(['voided']);
    expect(
      db
        .prepare("SELECT amount FROM wallet_transactions WHERE user_id = ? AND reason = 'takeover_refund'")
        .pluck()
        .all(alice.id),
    ).toEqual([offre]);
    const messages = db
      .prepare("SELECT payload FROM notifications WHERE user_id = ? AND kind = 'takeover_resolved'")
      .pluck()
      .all(alice.id) as string[];
    expect(messages.map((m) => contenuOpaTermineeSchema.parse(JSON.parse(m)))).toMatchObject([
      { status: 'voided', role: 'attacker', otherPseudo: `Joueur supprimé #${bruno.id}`, territoryInsee: '01001' },
    ]);
  });

  it('se reconnecter avec le même compte crée un compte neuf', async () => {
    const { app, bruno, supprimer } = await partie();
    await supprimer(bruno.cookie);

    const reponse = await app.inject({ method: 'POST', url: '/api/v1/auth/dev', payload: { pseudo: 'Bruno' } });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ isNew: true, user: { pseudo: 'Bruno' } });
    expect(reponse.json().user.id).not.toBe(bruno.id);
  });

  it('sans être connecté : 401', async () => {
    const { supprimer } = await partie();
    expect((await supprimer('sid=inconnu')).statusCode).toBe(401);
  });
});
