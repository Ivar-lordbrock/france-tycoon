import { describe, expect, it } from 'vitest';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { baseDeTest } from '../../outils-test/base.ts';
import { type Mouvement, wallet } from './wallet.ts';

function baseAvecJoueur(): { db: Base; id: number } {
  const db = baseDeTest();
  const id = db
    .prepare("INSERT INTO users (google_id, email, pseudo) VALUES ('g1', 'a@test.fr', 'Alice') RETURNING id")
    .pluck()
    .get() as number;
  return { db, id };
}

const appliquer = (db: Base, mouvement: Mouvement) => db.transaction(() => wallet.apply(db, mouvement)).immediate();
const soldes = (db: Base, id: number) =>
  db.prepare('SELECT cash, premium_currency AS gems FROM users WHERE id = ?').get(id) as { cash: number; gems: number };
const journal = (db: Base) =>
  db
    .prepare('SELECT currency, amount, balance_after, reason, ref_type, ref_id FROM wallet_transactions ORDER BY id')
    .all();

describe('wallet.apply', () => {
  it('crédite puis débite, et note chaque mouvement avec le solde après', () => {
    const { db, id } = baseAvecJoueur();

    expect(appliquer(db, { userId: id, currency: 'cash', amount: 30_000, reason: 'signup_bonus' })).toMatchObject({
      balance: 30_000,
      replayed: false,
    });
    appliquer(db, {
      userId: id,
      currency: 'cash',
      amount: -21_800,
      reason: 'territory_purchase',
      ref: { type: 'territory', id: 7 },
    });

    expect(soldes(db, id)).toEqual({ cash: 8_200, gems: 0 });
    expect(journal(db)).toEqual([
      { currency: 'cash', amount: 30_000, balance_after: 30_000, reason: 'signup_bonus', ref_type: null, ref_id: null },
      {
        currency: 'cash',
        amount: -21_800,
        balance_after: 8_200,
        reason: 'territory_purchase',
        ref_type: 'territory',
        ref_id: 7,
      },
    ]);
  });

  it('garde les gemmes à part du cash', () => {
    const { db, id } = baseAvecJoueur();

    appliquer(db, { userId: id, currency: 'gems', amount: 5, reason: 'tutorial_reward' });

    expect(soldes(db, id)).toEqual({ cash: 0, gems: 5 });
  });

  it('idempotence : la même clé ne paie qu’une fois et renvoie le même résultat', () => {
    const { db, id } = baseAvecJoueur();
    appliquer(db, { userId: id, currency: 'cash', amount: 10_000, reason: 'admin_adjustment' });
    const achat: Mouvement = {
      userId: id,
      currency: 'cash',
      amount: -3_000,
      reason: 'territory_purchase',
      idempotencyKey: 'achat-1',
    };

    const premier = appliquer(db, achat);
    const second = appliquer(db, achat);

    expect(second).toEqual({ ...premier, replayed: true });
    expect(soldes(db, id).cash).toBe(7_000);
    expect(journal(db)).toHaveLength(2);
  });

  it('refuse de réutiliser une clé pour un autre montant', () => {
    const { db, id } = baseAvecJoueur();
    appliquer(db, { userId: id, currency: 'cash', amount: 100, reason: 'admin_adjustment', idempotencyKey: 'k' });

    expect(() =>
      appliquer(db, { userId: id, currency: 'cash', amount: 200, reason: 'admin_adjustment', idempotencyKey: 'k' }),
    ).toThrow(/déjà utilisée/);
  });

  it('solde insuffisant : erreur INSUFFICIENT_FUNDS avec le manque, et rien ne bouge', () => {
    const { db, id } = baseAvecJoueur();
    appliquer(db, { userId: id, currency: 'cash', amount: 1_000, reason: 'admin_adjustment' });

    let erreur: unknown;
    try {
      appliquer(db, { userId: id, currency: 'cash', amount: -2_200, reason: 'territory_purchase' });
    } catch (e) {
      erreur = e;
    }

    expect(erreur).toBeInstanceOf(ErreurMetier);
    expect(erreur).toMatchObject({ code: 'INSUFFICIENT_FUNDS', statut: 409, details: { missing: 1_200 } });
    expect((erreur as Error).message).toMatch(/^Il manque 1\s200 ₮$/);
    expect(soldes(db, id).cash).toBe(1_000);
    expect(journal(db)).toHaveLength(1);
  });

  it('refuse d’être appelé hors transaction, ou avec un montant non entier ou nul', () => {
    const { db, id } = baseAvecJoueur();

    expect(() => wallet.apply(db, { userId: id, currency: 'cash', amount: 1, reason: 'admin_adjustment' })).toThrow(
      /transaction/,
    );
    expect(() => appliquer(db, { userId: id, currency: 'cash', amount: 1.5, reason: 'admin_adjustment' })).toThrow(
      /Montant invalide/,
    );
    expect(() => appliquer(db, { userId: id, currency: 'cash', amount: 0, reason: 'admin_adjustment' })).toThrow(
      /Montant invalide/,
    );
  });
});
