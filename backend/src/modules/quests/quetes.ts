import {
  type ContenuQueteTerminee,
  type EvenementQuete,
  jourParis,
  type Portefeuille,
  prochainMinuitParis,
  type Quete,
  type QuetesReponse,
  type ReclamerQueteReponse,
  recompenseQuete,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { creerLecteurRevenus, revenuDuJoueur } from '../income/revenus.ts';
import { mouvementDejaFait } from '../wallet/idempotence.ts';
import { wallet } from '../wallet/wallet.ts';
import { type ModeleQuete, tirerQuetes } from './tirage.ts';

// Quêtes du jour (docs/05-equilibrage.md, 5.7) : tirées au premier appel de la journée (heure de Paris),
// elles avancent avec les actions du joueur (bus d'événements, `backend/src/modules/evenements/bus.ts`).

/** Ce qui fait avancer une quête. */
export interface EvenementJeu {
  userId: number;
  type: EvenementQuete;
  /** Ce qui ne compte qu'une fois par quête : code INSEE, zone, heure d'encaissement. */
  ref?: string;
  /**
   * Tirer les quêtes du jour si ce n'est pas encore fait. Faux quand le joueur n'agit pas lui-même
   * (chantier fini pendant son absence) : seules les quêtes déjà tirées avancent.
   */
  tirer?: boolean;
}

interface LigneQuete extends Omit<Quete, 'description'> {
  description: string;
  seenRefs: string;
}

const COLONNES_QUETE = `uq.id, uq.slot, dq.code, dq.title, dq.description, dq.difficulty, dq.event_type AS eventType,
  uq.target, uq.progress, uq.reward_cash AS rewardCash, uq.reward_gems AS rewardGems,
  uq.completed_at AS completedAt, uq.claimed_at AS claimedAt, uq.seen_refs AS seenRefs`;

function versQuete({ seenRefs: _, ...ligne }: LigneQuete): Quete {
  return { ...ligne, description: ligne.description.replaceAll('{target}', String(ligne.target)) };
}

export function creerQuetes(db: Base) {
  const lireTerritoires = creerLecteurRevenus(db);
  const catalogue = db.prepare<[], ModeleQuete>(`
    SELECT id, code, event_type AS eventType, difficulty, target_min AS targetMin, target_max AS targetMax, weight,
      min_territories AS minTerritories, reward_income_hours AS rewardIncomeHours,
      reward_cash_min AS rewardCashMin, reward_gems AS rewardGems
    FROM daily_quests WHERE is_active = 1 ORDER BY id`);
  const inserer = db.prepare<Record<string, number | string | null>>(`
    INSERT INTO user_quests (user_id, quest_id, quest_date, slot, target, progress, reward_cash, reward_gems, completed_at)
    VALUES (@moi, @quete, @jour, @slot, @target, @progres, @cash, @gemmes, @fini)`);
  const duJour = db.prepare<{ moi: number; jour: string }, LigneQuete>(`
    SELECT ${COLONNES_QUETE} FROM user_quests AS uq JOIN daily_quests AS dq ON dq.id = uq.quest_id
    WHERE uq.user_id = @moi AND uq.quest_date = @jour ORDER BY uq.slot`);
  const parId = db.prepare<[number, number], LigneQuete>(`
    SELECT ${COLONNES_QUETE} FROM user_quests AS uq JOIN daily_quests AS dq ON dq.id = uq.quest_id
    WHERE uq.id = ? AND uq.user_id = ?`);
  const avancer = db.prepare<{ id: number; progres: number; vus: string; fini: number | null }>(
    'UPDATE user_quests SET progress = @progres, seen_refs = @vus, completed_at = @fini WHERE id = @id',
  );
  const marquerReclamee = db.prepare<[number, number]>(
    'UPDATE user_quests SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL AND completed_at IS NOT NULL',
  );
  const notifier = db.prepare<[number, string, number]>(
    "INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, 'quest_completed', ?, ?)",
  );
  const portefeuille = db.prepare<[number], Portefeuille>(
    'SELECT cash, premium_currency AS gems FROM users WHERE id = ?',
  );

  /** Tire les 3 quêtes du jour ; la récompense est figée avec le revenu du moment. */
  function tirer(moi: number, jour: string, maintenant: number): void {
    const territoires = [...lireTerritoires(moi).values()];
    const revenu = revenuDuJoueur(territoires, maintenant);
    for (const { modele, slot, target } of tirerQuetes(catalogue.all(), territoires.length, `${moi}:${jour}`)) {
      // « Passer au bureau » : le joueur est là, puisque c'est lui qui fait tirer ses quêtes.
      const connexion = modele.eventType === 'login';
      inserer.run({
        moi,
        quete: modele.id,
        jour,
        slot,
        target,
        progres: connexion ? target : 0,
        cash: recompenseQuete(modele.rewardIncomeHours, revenu, modele.rewardCashMin),
        gemmes: modele.rewardGems,
        fini: connexion ? maintenant : null,
      });
    }
  }

  function lignesDuJour(moi: number, maintenant: number, tirerSiBesoin: boolean): LigneQuete[] {
    const jour = jourParis(maintenant);
    const lignes = duJour.all({ moi, jour });
    if (lignes.length > 0 || !tirerSiBesoin) return lignes;
    tirer(moi, jour, maintenant);
    return duJour.all({ moi, jour });
  }

  function exigerTransaction(action: string): void {
    if (!db.inTransaction) throw new Error(`${action} doit être appelé dans une transaction`);
  }

  return {
    /** GET /me/quests : les quêtes du jour, tirées si c'est le premier appel de la journée. */
    quetesDuJour(moi: number, maintenant: number): QuetesReponse {
      exigerTransaction('quetesDuJour');
      return {
        date: jourParis(maintenant),
        resetsAt: prochainMinuitParis(maintenant),
        quests: lignesDuJour(moi, maintenant, true).map(versQuete),
      };
    },

    /** Une action du joueur fait avancer ses quêtes du jour du même type ; un message quand l'une est finie. */
    progresser(e: EvenementJeu, maintenant: number): void {
      exigerTransaction('progresser');
      for (const q of lignesDuJour(e.userId, maintenant, e.tirer ?? true)) {
        if (q.eventType !== e.type || q.completedAt !== null) continue;
        const vus: string[] = JSON.parse(q.seenRefs);
        if (e.ref !== undefined) {
          if (vus.includes(e.ref)) continue;
          vus.push(e.ref);
        }
        const progres = Math.min(q.target, q.progress + 1);
        const fini = progres >= q.target ? maintenant : null;
        avancer.run({ id: q.id, progres, vus: JSON.stringify(vus), fini });
        if (fini === null) continue;
        const contenu: ContenuQueteTerminee = {
          questId: q.id,
          code: q.code,
          title: q.title,
          rewardCash: q.rewardCash,
          rewardGems: q.rewardGems,
        };
        notifier.run(e.userId, JSON.stringify(contenu), maintenant);
      }
    },

    /** POST /me/quests/:id/claim : verse la récompense d'une quête finie (une seule fois). */
    reclamer(moi: number, id: number, maintenant: number, cle?: string): ReclamerQueteReponse {
      exigerTransaction('reclamer');
      const q = parId.get(id, moi);
      if (!q) throw new ErreurMetier('NOT_FOUND', 404, 'Quête introuvable.');

      const deja = mouvementDejaFait(db, cle);
      if (deja && deja.refId !== q.id) {
        throw new ErreurMetier('VALIDATION_ERROR', 400, 'Cette clé Idempotency-Key a déjà servi pour autre chose.');
      }
      if (!deja) {
        if (q.completedAt === null) {
          throw new ErreurMetier('QUEST_NOT_CLAIMABLE', 409, 'Cette quête n’est pas encore finie.', {
            reason: 'not_completed',
          });
        }
        if (q.claimedAt !== null) {
          throw new ErreurMetier('QUEST_NOT_CLAIMABLE', 409, 'Tu as déjà reçu cette récompense.', {
            reason: 'already_claimed',
          });
        }
        if (marquerReclamee.run(maintenant, q.id).changes !== 1) throw new Error(`Quête ${q.id} : réclamation ratée`);
        const ref = { type: 'user_quest', id: q.id };
        if (q.rewardCash > 0) {
          wallet.apply(db, {
            userId: moi,
            currency: 'cash',
            amount: q.rewardCash,
            reason: 'quest_reward',
            ref,
            idempotencyKey: cle,
          });
        }
        if (q.rewardGems > 0) {
          wallet.apply(db, {
            userId: moi,
            currency: 'gems',
            amount: q.rewardGems,
            reason: 'quest_reward',
            ref,
            idempotencyKey: cle === undefined ? undefined : `${cle}:gems`,
          });
        }
      }

      const apres = parId.get(id, moi);
      const solde = portefeuille.get(moi);
      if (!apres || !solde) throw new Error(`Quête ${id} introuvable après la réclamation`);
      return { quest: versQuete(apres), wallet: solde };
    },
  };
}
