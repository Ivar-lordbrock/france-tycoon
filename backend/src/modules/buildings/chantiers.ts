import {
  type AnnulationReponse,
  type Batiment,
  bonusNiveau,
  type ChantierReponse,
  coutNiveau,
  type DemolitionReponse,
  DUREE_CHANTIER_TUTORIEL_S,
  dureeChantier,
  facteurTaille,
  type ParametresBatiment,
  type Portefeuille,
  remboursementDemolition,
  revenuNiveau,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { mouvementDejaFait } from '../wallet/idempotence.ts';
import { wallet } from '../wallet/wallet.ts';

// Bâtiments (docs/05-equilibrage.md, 5.2) : construire, améliorer, annuler un chantier, démolir.
// Chaque action encaisse d'abord les revenus en attente (le chantier fini compte, le nouveau ne compte pas encore).

/** Colonnes de `building_types` (alias `bt`) utiles aux règles de construction. */
const COLONNES_TYPE = `bt.id AS typeId, bt.code AS typeCode, bt.name, bt.category,
  bt.base_cost AS baseCost, bt.cost_growth AS costGrowth,
  bt.base_income_per_hour AS baseIncomePerHour, bt.income_growth AS incomeGrowth, bt.income_bonus_pct AS incomeBonusPct,
  bt.base_build_seconds AS baseBuildSeconds, bt.time_growth AS timeGrowth, bt.scales_with_territory AS scalesWithTerritory,
  bt.max_level AS maxLevel, bt.slot_size AS slotSize, bt.max_per_territory AS maxPerTerritory,
  bt.max_per_user AS maxPerUser, bt.min_population AS minPopulation`;

interface LigneType extends Omit<ParametresBatiment, 'scalesWithTerritory'> {
  typeId: number;
  typeCode: string;
  name: string;
  category: string;
  scalesWithTerritory: number;
  maxLevel: number;
  slotSize: number;
  maxPerTerritory: number | null;
  maxPerUser: number | null;
  minPopulation: number;
}

interface LigneCommune {
  id: number;
  insee: string;
  baseValue: number;
  population: number;
  slots: number;
  ownerId: number | null;
}

interface LigneBatiment extends LigneType {
  id: number;
  territoryId: number;
  territoryInsee: string;
  baseValue: number;
  ownerId: number | null;
  level: number;
  targetLevel: number | null;
  worksStartedAt: number | null;
  worksEndsAt: number | null;
  worksCost: number | null;
  investedCash: number;
}

const parametres = (t: LigneType): ParametresBatiment => ({ ...t, scalesWithTerritory: t.scalesWithTerritory === 1 });

/** Le siège social : sa commune est la capitale du joueur. */
const estSiege = (t: LigneType) => t.category === 'siege';

/** Un bâtiment au format de l'API (`batimentSchema`), revenu et bonus de son niveau actif. */
function versBatiment(b: LigneBatiment): Batiment {
  const type = parametres(b);
  const fT = facteurTaille(b.baseValue);
  return {
    id: b.id,
    territoryInsee: b.territoryInsee,
    typeCode: b.typeCode,
    name: b.name,
    level: b.level,
    targetLevel: b.targetLevel,
    worksStartedAt: b.worksStartedAt,
    worksEndsAt: b.worksEndsAt,
    investedCash: b.investedCash,
    incomePerHour: revenuNiveau(type, b.level, fT),
    bonusPct: bonusNiveau(type, b.level),
  };
}

const nombre = new Intl.NumberFormat('fr-FR');

/** Les quatre actions, avec leurs requêtes préparées une fois. */
export function creerChantiers(db: Base) {
  const encaisser = creerEncaisseur(db);
  const typeParCode = db.prepare<[string], LigneType>(
    `SELECT ${COLONNES_TYPE} FROM building_types AS bt WHERE bt.code = ? AND bt.is_active = 1`,
  );
  const commune = db.prepare<[string], LigneCommune>(`
    SELECT id, insee_code AS insee, base_value AS baseValue, population, building_slots AS slots, owner_id AS ownerId
    FROM territories WHERE insee_code = ?`);
  const batiment = db.prepare<[number], LigneBatiment>(`
    SELECT b.id, b.territory_id AS territoryId, t.insee_code AS territoryInsee, t.base_value AS baseValue,
      t.owner_id AS ownerId, b.level, b.target_level AS targetLevel, b.works_started_at AS worksStartedAt,
      b.works_ends_at AS worksEndsAt, b.works_cost AS worksCost, b.invested_cash AS investedCash, ${COLONNES_TYPE}
    FROM buildings AS b
    JOIN territories AS t ON t.id = b.territory_id
    JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE b.id = ?`);
  const emplacementsPris = db
    .prepare<[number], number>(`
      SELECT coalesce(sum(bt.slot_size), 0) FROM buildings AS b
      JOIN building_types AS bt ON bt.id = b.building_type_id
      WHERE b.territory_id = ?`)
    .pluck();
  const dansLaCommune = db
    .prepare<[number, number], number>('SELECT count(*) FROM buildings WHERE territory_id = ? AND building_type_id = ?')
    .pluck();
  const chezLeJoueur = db
    .prepare<[number, number], number>(`
      SELECT count(*) FROM buildings AS b JOIN territories AS t ON t.id = b.territory_id
      WHERE t.owner_id = ? AND b.building_type_id = ?`)
    .pluck();
  const chantiersEnCours = db
    .prepare<[number], number>(`
      SELECT count(*) FROM buildings AS b JOIN territories AS t ON t.id = b.territory_id
      WHERE t.owner_id = ? AND b.target_level IS NOT NULL`)
    .pluck();
  const files = db.prepare<[number], number>('SELECT build_queue_slots FROM users WHERE id = ?').pluck();
  // Premier chantier du tutoriel : 10 s (docs/05, 5.2), tant que le joueur n'a jamais construit.
  const premierChantierDuTutoriel = db
    .prepare<[number], number>(`
      SELECT u.tutorial_completed_at IS NULL AND u.tutorial_skipped = 0 AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions AS w WHERE w.user_id = u.id AND w.reason = 'building_construction'
      ) FROM users AS u WHERE u.id = ?`)
    .pluck();
  const inserer = db
    .prepare<{ territoire: number; type: number; debut: number; fin: number; cout: number }, number>(`
      INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_started_at, works_ends_at,
        works_cost, invested_cash, created_at, updated_at)
      VALUES (@territoire, @type, 0, 1, @debut, @fin, @cout, @cout, @debut, @debut)
      RETURNING id`)
    .pluck();
  const lancer = db.prepare<{ id: number; debut: number; fin: number; cout: number }>(`
    UPDATE buildings SET target_level = level + 1, works_started_at = @debut, works_ends_at = @fin,
      works_cost = @cout, invested_cash = invested_cash + @cout, updated_at = @debut
    WHERE id = @id AND target_level IS NULL`);
  // Dans un UPDATE, `works_cost` à droite est l'ancienne valeur : on retire bien le prix du chantier annulé.
  const arreter = db.prepare<[number, number]>(`
    UPDATE buildings SET target_level = NULL, works_started_at = NULL, works_ends_at = NULL, works_cost = NULL,
      invested_cash = invested_cash - works_cost, updated_at = ?
    WHERE id = ? AND target_level IS NOT NULL`);
  const supprimer = db.prepare<[number]>('DELETE FROM buildings WHERE id = ?');
  const enleverCapitale = db.prepare<[number]>(
    'UPDATE territories SET is_capital = 0 WHERE owner_id = ? AND is_capital = 1',
  );
  const poserCapitale = db.prepare<[number, number]>(
    'UPDATE territories SET is_capital = 1 WHERE id = ? AND owner_id = ?',
  );
  const portefeuille = db.prepare<[number], Portefeuille>(
    'SELECT cash, premium_currency AS gems FROM users WHERE id = ?',
  );

  function lirePortefeuille(moi: number): Portefeuille {
    const p = portefeuille.get(moi);
    if (!p) throw new Error(`Joueur inconnu : ${moi}`);
    return p;
  }

  /** Le bâtiment `id`, s'il est à `moi`. */
  function monBatiment(moi: number, id: number): LigneBatiment {
    const b = batiment.get(id);
    if (!b) throw new ErreurMetier('NOT_FOUND', 404, 'Ce bâtiment n’existe pas.');
    if (b.ownerId !== moi) throw new ErreurMetier('FORBIDDEN', 403, 'Ce bâtiment n’est pas à toi.');
    return b;
  }

  function lireBatiment(id: number): Batiment {
    const b = batiment.get(id);
    if (!b) throw new Error(`Bâtiment ${id} introuvable`);
    return versBatiment(b);
  }

  /** Une seule file de construction (docs/05, 5.2) : un chantier à la fois tant qu'on n'en a pas acheté d'autre. */
  function verifierFile(moi: number): void {
    const places = files.get(moi) ?? 1;
    if ((chantiersEnCours.get(moi) ?? 0) >= places) {
      throw new ErreurMetier(
        'BUILD_QUEUE_FULL',
        409,
        'Un chantier est déjà en cours : attends qu’il finisse, ou annule-le.',
        { slots: places },
      );
    }
  }

  /** Une clé déjà servie pour un autre bâtiment est une erreur du client, pas un rejeu. */
  function rejeu(cle: string | undefined, batimentId?: number): { amount: number; refId: number | null } | undefined {
    const deja = mouvementDejaFait(db, cle);
    if (deja && batimentId !== undefined && deja.refId !== batimentId) {
      throw new ErreurMetier('VALIDATION_ERROR', 400, 'Cette clé Idempotency-Key a déjà servi pour un autre bâtiment.');
    }
    return deja;
  }

  /** POST /territories/:insee/buildings : premier chantier (niveau 0 → 1). */
  function construire(moi: number, insee: string, typeCode: string, maintenant: number, cle?: string): ChantierReponse {
    const id = db
      .transaction((): number => {
        encaisser(moi, maintenant);
        const c = commune.get(insee);
        if (!c) throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune française avec le code ${insee}.`);
        const deja = rejeu(cle);
        if (deja?.refId != null) {
          const b = batiment.get(deja.refId);
          if (!b || b.territoryId !== c.id) {
            throw new ErreurMetier(
              'VALIDATION_ERROR',
              400,
              'Cette clé Idempotency-Key a déjà servi pour un autre chantier.',
            );
          }
          return b.id;
        }
        if (c.ownerId !== moi) throw new ErreurMetier('FORBIDDEN', 403, 'Cette commune n’est pas à toi.');
        const type = typeParCode.get(typeCode);
        if (!type) throw new ErreurMetier('NOT_FOUND', 404, `Le bâtiment « ${typeCode} » n’existe pas.`);

        verifierFile(moi);
        const libres = c.slots - (emplacementsPris.get(c.id) ?? 0);
        if (type.slotSize > libres) {
          throw new ErreurMetier(
            'NO_FREE_SLOT',
            409,
            `${type.name} prend ${type.slotSize} place${type.slotSize > 1 ? 's' : ''} : il en reste ${libres} ici.`,
            { needed: type.slotSize, free: libres },
          );
        }
        if (c.population < type.minPopulation) {
          throw new ErreurMetier(
            'BUILDING_REQUIREMENT',
            409,
            `${type.name} demande au moins ${nombre.format(type.minPopulation)} habitants.`,
          );
        }
        if (type.maxPerTerritory !== null && (dansLaCommune.get(c.id, type.typeId) ?? 0) >= type.maxPerTerritory) {
          throw new ErreurMetier(
            'BUILDING_REQUIREMENT',
            409,
            `${type.name} : ${type.maxPerTerritory} au plus par commune, c’est déjà fait ici.`,
          );
        }
        if (type.maxPerUser !== null && (chezLeJoueur.get(moi, type.typeId) ?? 0) >= type.maxPerUser) {
          throw new ErreurMetier(
            'BUILDING_REQUIREMENT',
            409,
            `${type.name} : ${type.maxPerUser} au plus par joueur, tu l’as déjà.`,
          );
        }

        const cout = coutNiveau(parametres(type), 1, facteurTaille(c.baseValue));
        const duree = premierChantierDuTutoriel.get(moi)
          ? DUREE_CHANTIER_TUTORIEL_S
          : dureeChantier(parametres(type), 1);
        const nouveau = inserer.get({
          territoire: c.id,
          type: type.typeId,
          debut: maintenant,
          fin: maintenant + duree,
          cout,
        });
        if (nouveau === undefined) throw new Error('bâtiment non créé');
        wallet.apply(db, {
          userId: moi,
          currency: 'cash',
          amount: -cout,
          reason: 'building_construction',
          ref: { type: 'building', id: nouveau },
          idempotencyKey: cle,
        });
        // Le siège social fait de sa commune la capitale (immunisée contre les OPA) dès le début du chantier.
        if (estSiege(type)) {
          enleverCapitale.run(moi);
          poserCapitale.run(c.id, moi);
        }
        return nouveau;
      })
      .immediate();

    return { building: lireBatiment(id), wallet: lirePortefeuille(moi) };
  }

  /** POST /buildings/:id/upgrade : chantier du niveau L au niveau L + 1 ; le bâtiment produit au niveau L pendant ce temps. */
  function ameliorer(moi: number, id: number, maintenant: number, cle?: string): ChantierReponse {
    db.transaction(() => {
      encaisser(moi, maintenant);
      const b = monBatiment(moi, id);
      if (rejeu(cle, id)) return;
      if (b.targetLevel !== null) {
        throw new ErreurMetier('WORKS_IN_PROGRESS', 409, 'Un chantier est déjà en cours sur ce bâtiment.');
      }
      if (b.level >= b.maxLevel) {
        throw new ErreurMetier('BUILDING_REQUIREMENT', 409, `${b.name} est déjà au niveau maximum (${b.maxLevel}).`);
      }
      verifierFile(moi);

      const type = parametres(b);
      const cout = coutNiveau(type, b.level + 1, facteurTaille(b.baseValue));
      const fin = maintenant + dureeChantier(type, b.level + 1);
      if (lancer.run({ id, debut: maintenant, fin, cout }).changes !== 1)
        throw new Error(`Bâtiment ${id} déjà en chantier`);
      wallet.apply(db, {
        userId: moi,
        currency: 'cash',
        amount: -cout,
        reason: 'building_upgrade',
        ref: { type: 'building', id },
        idempotencyKey: cle,
      });
    }).immediate();

    return { building: lireBatiment(id), wallet: lirePortefeuille(moi) };
  }

  /**
   * POST /buildings/:id/cancel : rend tout le prix du chantier ; le bâtiment garde son niveau.
   * Une première construction annulée supprime le bâtiment (et la capitale, pour un siège social).
   */
  function annuler(moi: number, id: number, maintenant: number, cle?: string): AnnulationReponse {
    const { refunded, garde } = db
      .transaction((): { refunded: number; garde: boolean } => {
        encaisser(moi, maintenant); // un chantier déjà fini n'est plus annulable
        const deja = mouvementDejaFait(db, cle);
        if (deja) {
          if (deja.refId !== id) {
            throw new ErreurMetier(
              'VALIDATION_ERROR',
              400,
              'Cette clé Idempotency-Key a déjà servi pour un autre bâtiment.',
            );
          }
          return { refunded: deja.amount, garde: batiment.get(id) !== undefined };
        }
        const b = monBatiment(moi, id);
        if (b.targetLevel === null || b.worksCost === null) {
          throw new ErreurMetier('NO_WORKS_IN_PROGRESS', 409, 'Aucun chantier en cours sur ce bâtiment.');
        }

        const premier = b.level === 0;
        if (premier) {
          supprimer.run(id);
          if (estSiege(b)) enleverCapitale.run(moi);
        } else {
          arreter.run(maintenant, id);
        }
        // Pas de raison « annulation » dans le journal (liste fermée, 001) : même raison que le paiement, en positif.
        wallet.apply(db, {
          userId: moi,
          currency: 'cash',
          amount: b.worksCost,
          reason: premier ? 'building_construction' : 'building_upgrade',
          ref: { type: 'building', id },
          idempotencyKey: cle,
          metadata: { cancelled: true, targetLevel: b.targetLevel },
        });
        return { refunded: b.worksCost, garde: !premier };
      })
      .immediate();

    return { building: garde ? lireBatiment(id) : null, refunded, wallet: lirePortefeuille(moi) };
  }

  /** DELETE /buildings/:id : rend 30 % du cash investi. Le siège social ne se démolit pas. */
  function demolir(moi: number, id: number, maintenant: number): DemolitionReponse {
    const refunded = db
      .transaction((): number => {
        encaisser(moi, maintenant);
        const b = monBatiment(moi, id);
        if (estSiege(b)) {
          throw new ErreurMetier(
            'CAPITAL_IMMUNE',
            409,
            'Le siège social ne se démolit pas : déplace ta capitale si tu veux le changer de commune.',
          );
        }
        if (b.targetLevel !== null) {
          throw new ErreurMetier(
            'WORKS_IN_PROGRESS',
            409,
            'Un chantier est en cours sur ce bâtiment : annule-le d’abord.',
          );
        }
        const montant = remboursementDemolition(b.investedCash);
        supprimer.run(id);
        if (montant > 0) {
          wallet.apply(db, {
            userId: moi,
            currency: 'cash',
            amount: montant,
            reason: 'building_demolition_refund',
            ref: { type: 'building', id },
          });
        }
        return montant;
      })
      .immediate();

    return { refunded, wallet: lirePortefeuille(moi) };
  }

  return { construire, ameliorer, annuler, demolir };
}
