import { type CapitaleReponse, DELAI_DEPLACEMENT_CAPITALE_S } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { creerEncaisseur } from '../income/revenus.ts';

interface LigneSiege {
  id: number;
  territoryId: number;
  targetLevel: number | null;
  slotSize: number;
}

/**
 * POST /me/capital : la capitale est la commune du siège social ; la déplacer, c'est déplacer le siège
 * (avec son niveau et son cash investi) dans une autre de ses communes. Une fois tous les 7 jours.
 */
export function creerDeplacementCapitale(db: Base) {
  const encaisser = creerEncaisseur(db);
  const commune = db.prepare<[string], { id: number; ownerId: number | null; slots: number }>(
    'SELECT id, owner_id AS ownerId, building_slots AS slots FROM territories WHERE insee_code = ?',
  );
  const siege = db.prepare<[number], LigneSiege>(`
    SELECT b.id, b.territory_id AS territoryId, b.target_level AS targetLevel, bt.slot_size AS slotSize
    FROM buildings AS b
    JOIN territories AS t ON t.id = b.territory_id
    JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE t.owner_id = ? AND bt.category = 'siege'`);
  const dernierDeplacement = db
    .prepare<[number], number | null>('SELECT capital_moved_at FROM users WHERE id = ?')
    .pluck();
  const emplacementsPris = db
    .prepare<[number], number>(`
      SELECT coalesce(sum(bt.slot_size), 0) FROM buildings AS b
      JOIN building_types AS bt ON bt.id = b.building_type_id
      WHERE b.territory_id = ?`)
    .pluck();
  const opaEnCours = db
    .prepare<[number], number>("SELECT 1 FROM takeovers WHERE territory_id = ? AND status = 'pending'")
    .pluck();
  const deplacerSiege = db.prepare<[number, number, number]>(
    'UPDATE buildings SET territory_id = ?, updated_at = ? WHERE id = ?',
  );
  const capitale = db.prepare<[number, number]>('UPDATE territories SET is_capital = ? WHERE id = ?');
  const noter = db.prepare<[number, number]>('UPDATE users SET capital_moved_at = ? WHERE id = ?');

  return function deplacerCapitale(moi: number, insee: string, maintenant: number): CapitaleReponse {
    return db
      .transaction((): CapitaleReponse => {
        encaisser(moi, maintenant);
        const c = commune.get(insee);
        if (!c) throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune française avec le code ${insee}.`);
        if (c.ownerId !== moi) throw new ErreurMetier('FORBIDDEN', 403, 'Cette commune n’est pas à toi.');
        const s = siege.get(moi);
        if (!s) {
          throw new ErreurMetier(
            'BUILDING_REQUIREMENT',
            409,
            'Construis d’abord ton siège social : sa commune devient ta capitale.',
          );
        }
        if (s.territoryId === c.id) throw new ErreurMetier('VALIDATION_ERROR', 400, 'C’est déjà ta capitale.');
        const dernier = dernierDeplacement.get(moi) ?? null;
        if (dernier !== null && dernier + DELAI_DEPLACEMENT_CAPITALE_S > maintenant) {
          const nextMoveAt = dernier + DELAI_DEPLACEMENT_CAPITALE_S;
          throw new ErreurMetier('CAPITAL_COOLDOWN', 409, 'Ta capitale a déjà bougé cette semaine.', { nextMoveAt });
        }
        if (s.targetLevel !== null) {
          throw new ErreurMetier(
            'WORKS_IN_PROGRESS',
            409,
            'Ton siège social est en chantier : attends la fin, ou annule le chantier.',
          );
        }
        const libres = c.slots - (emplacementsPris.get(c.id) ?? 0);
        if (s.slotSize > libres) {
          throw new ErreurMetier(
            'NO_FREE_SLOT',
            409,
            `Le siège social prend ${s.slotSize} places : il en reste ${libres} dans cette commune.`,
            { needed: s.slotSize, free: libres },
          );
        }
        if (opaEnCours.get(c.id)) {
          throw new ErreurMetier(
            'TAKEOVER_ALREADY_PENDING',
            409,
            'Une OPA est en cours sur cette commune : elle ne peut pas devenir ta capitale.',
          );
        }

        deplacerSiege.run(c.id, maintenant, s.id);
        capitale.run(0, s.territoryId); // une seule capitale par joueur (index unique) : on enlève d'abord l'ancienne
        capitale.run(1, c.id);
        noter.run(maintenant, moi);
        return { capitalInsee: insee, nextMoveAt: maintenant + DELAI_DEPLACEMENT_CAPITALE_S };
      })
      .immediate();
  };
}
