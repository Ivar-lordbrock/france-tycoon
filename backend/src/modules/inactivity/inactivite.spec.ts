import {
  AVERTISSEMENT_INACTIVITE_S,
  contenuAvertissementInactiviteSchema,
  contenuLiberationInactiviteSchema,
  contenuOpaTermineeSchema,
  LIBERATION_INACTIVITE_S,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { creerTaches } from '../../jobs/taches.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { creerInactivite } from './inactivite.ts';

const jour = 86_400;
const maintenant = () => Math.floor(Date.now() / 1000);

/** Bruno possède le village (Résidence, 1 000 de fortification) et sa capitale Ambérieu ; Alice et Carla jouent. */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const carla = await connecter(app, 'Carla');
  const sql = (requete: string, ...valeurs: unknown[]) => db.prepare(requete).run(...valeurs);
  sql("UPDATE territories SET owner_id = ?, fortification_value = 1000 WHERE insee_code = '01001'", bruno.id);
  sql("UPDATE territories SET owner_id = ?, is_capital = 1 WHERE insee_code = '01004'", bruno.id);
  db.exec(`
    INSERT INTO buildings (territory_id, building_type_id, level, invested_cash)
    SELECT t.id, bt.id, 1, 4430 FROM territories AS t, building_types AS bt
    WHERE t.insee_code = '01001' AND bt.code = 'residence'`);
  /** Bruno (ou un autre) n'a rien fait depuis `secondes`. */
  const absent = (userId: number, secondes: number) =>
    sql(
      'UPDATE users SET last_active_at = ?, income_collected_at = ? WHERE id = ?',
      maintenant() - secondes,
      maintenant() - secondes,
      userId,
    );
  const notifications = (userId: number, kind: string) =>
    (
      db
        .prepare('SELECT payload FROM notifications WHERE user_id = ? AND kind = ? ORDER BY id')
        .pluck()
        .all(userId, kind) as string[]
    ).map((p) => JSON.parse(p));
  const mouvements = (userId: number, raison: string) =>
    db
      .prepare('SELECT amount FROM wallet_transactions WHERE user_id = ? AND reason = ? ORDER BY id')
      .pluck()
      .all(userId, raison);
  const statut = (userId: number) => db.prepare('SELECT status FROM users WHERE id = ?').pluck().get(userId);
  return { db, app, alice, bruno, carla, sql, absent, notifications, mouvements, statut, ...creerInactivite(db) };
}

describe('avertissement à 11 jours (warn-inactive)', () => {
  it('prévient une fois par absence, seulement ceux qui ont des territoires', async () => {
    const { bruno, carla, absent, avertir, notifications } = await partie();
    absent(bruno.id, AVERTISSEMENT_INACTIVITE_S + 60);
    absent(carla.id, AVERTISSEMENT_INACTIVITE_S + 60); // aucun territoire : rien à libérer

    expect(avertir(maintenant())).toBe(1);
    expect(avertir(maintenant())).toBe(0);

    const [message] = notifications(bruno.id, 'inactivity_warning');
    const derniereVisite = maintenant() - AVERTISSEMENT_INACTIVITE_S - 60;
    expect(contenuAvertissementInactiviteSchema.parse(message)).toEqual({
      releaseAt: derniereVisite + LIBERATION_INACTIVITE_S,
    });
    expect(notifications(carla.id, 'inactivity_warning')).toEqual([]);
  });

  it('pas avant 11 jours ; de nouveau après un retour puis une nouvelle absence', async () => {
    const { bruno, sql, absent, avertir, notifications } = await partie();
    absent(bruno.id, AVERTISSEMENT_INACTIVITE_S - 60);
    expect(avertir(maintenant())).toBe(0);

    absent(bruno.id, AVERTISSEMENT_INACTIVITE_S + 60);
    expect(avertir(maintenant())).toBe(1);
    // Il revient une heure plus tard (activité notée), puis repart 11 jours : nouveau message.
    const retour = maintenant() + 3_600;
    sql('UPDATE users SET last_active_at = ? WHERE id = ?', retour, bruno.id);
    expect(avertir(retour + AVERTISSEMENT_INACTIVITE_S - 60)).toBe(0);
    expect(avertir(retour + AVERTISSEMENT_INACTIVITE_S + 60)).toBe(1);
    expect(notifications(bruno.id, 'inactivity_warning')).toHaveLength(2);
  });
});

describe('libération à 14 jours (release-inactive)', () => {
  it('l’État rachète chaque territoire à 50 % de V0 + bâtiments ; communes libres, bâtiments détruits', async () => {
    const { db, bruno, absent, libererAbsents, mouvements, notifications, statut } = await partie();
    absent(bruno.id, LIBERATION_INACTIVITE_S + 60);

    expect(libererAbsents(maintenant())).toBe(1);

    // Village : 50 % de (21 800 + 4 430) = 13 115 → 13 100 (fortifications non comptées) ; capitale : 15 000.
    expect(mouvements(bruno.id, 'inactivity_buyback')).toEqual([13_100, 15_000]);
    expect(mouvements(bruno.id, 'income_collect')).toHaveLength(1); // ses revenus en attente (48 h au plus)
    const communes = db
      .prepare(
        `SELECT insee_code AS insee, owner_id AS ownerId, is_capital AS isCapital, fortification_value AS fortification,
          shield_until AS shieldUntil FROM territories ORDER BY insee_code`,
      )
      .all();
    expect(communes).toEqual([
      { insee: '01001', ownerId: null, isCapital: 0, fortification: 0, shieldUntil: null },
      { insee: '01004', ownerId: null, isCapital: 0, fortification: 0, shieldUntil: null },
    ]);
    expect(db.prepare('SELECT count(*) FROM buildings').pluck().get()).toBe(0);
    expect(statut(bruno.id)).toBe('dormant');
    expect(contenuLiberationInactiviteSchema.parse(notifications(bruno.id, 'inactivity_released')[0])).toEqual({
      territories: 2,
      amount: 28_100,
    });
    const historique = db
      .prepare('SELECT reason, from_user_id AS de, to_user_id AS vers, price FROM territory_ownership_history')
      .all();
    expect(historique).toEqual([
      { reason: 'inactivity_release', de: bruno.id, vers: null, price: 13_100 },
      { reason: 'inactivity_release', de: bruno.id, vers: null, price: 15_000 },
    ]);

    expect(libererAbsents(maintenant())).toBe(0); // déjà fait
  });

  it('pas avant 14 jours, et pas ceux qui sont revenus', async () => {
    const { alice, bruno, absent, libererAbsents, statut } = await partie();
    absent(bruno.id, LIBERATION_INACTIVITE_S - 60);

    expect(libererAbsents(maintenant())).toBe(0);
    expect(statut(bruno.id)).toBe('active');
    expect(statut(alice.id)).toBe('active');
  });

  it('les OPA qui le visent sont annulées : l’attaquant récupère toute son offre', async () => {
    const { app, alice, bruno, sql, absent, libererAbsents, mouvements, notifications } = await partie();
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
    absent(bruno.id, LIBERATION_INACTIVITE_S + 60);

    libererAbsents(maintenant());

    expect(mouvements(alice.id, 'takeover_refund')).toEqual([offre]);
    expect(notifications(alice.id, 'takeover_resolved').map((m) => contenuOpaTermineeSchema.parse(m))).toMatchObject([
      { status: 'voided', role: 'attacker', otherPseudo: 'Bruno', territoryInsee: '01001' },
    ]);
  });

  it('un joueur libéré qui revient redevient actif et garde son cash', async () => {
    const { app, bruno, absent, libererAbsents, statut } = await partie();
    absent(bruno.id, LIBERATION_INACTIVITE_S + 60);
    libererAbsents(maintenant());
    expect(statut(bruno.id)).toBe('dormant');

    const moi = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: bruno.cookie } });

    expect(moi.statusCode).toBe(200);
    expect(statut(bruno.id)).toBe('active');
    expect(moi.json().wallet.cash).toBeGreaterThan(50_000 + 28_100); // départ + rachat + revenus en attente
  });
});

describe('tâches planifiées', () => {
  it('warn-inactive et release-inactive tournent toutes les heures, leaderboard toutes les 10 min', () => {
    const taches = creerTaches(baseDeTest()).map((t) => [t.nom, t.toutesLes]);
    expect(taches).toEqual([
      ['resolve-takeovers', 60],
      ['warn-inactive', 3_600],
      ['release-inactive', 3_600],
      ['leaderboard', 600],
    ]);
  });
});
