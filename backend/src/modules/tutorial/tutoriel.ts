import type { EtapeFaiteReponse, EtapeTutoriel, Portefeuille, TutorielReponse } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import type { EvenementJeu } from '../evenements/bus.ts';
import { wallet } from '../wallet/wallet.ts';

// Tutoriel (docs/05-equilibrage.md, 5.7) : 10 étapes (table `tutorials`). Les étapes « client » sont validées
// par l'écran (POST /tutorial/:stepKey/complete), les étapes « serveur » quand l'action a lieu (bus d'événements).
// Tant que le joueur n'a ni fini ni passé le tutoriel, une étape faite est gardée et sa récompense versée,
// une seule fois, dans n'importe quel ordre. Après « Passer », plus rien ne compte.

interface LigneEtape extends Omit<EtapeTutoriel, 'completedAt'> {
  id: number;
  completionEvent: string;
}

interface EtatJoueur {
  completedAt: number | null;
  skipped: number;
}

export function creerTutoriel(db: Base) {
  const etapes = db.prepare<[], LigneEtape>(`
    SELECT id, step_key AS key, position, title, body, ui_anchor AS anchor, validated_by AS validatedBy,
      completion_event AS completionEvent, reward_cash AS rewardCash, reward_gems AS rewardGems
    FROM tutorials ORDER BY position`);
  const faites = db.prepare<[number], { id: number; completedAt: number }>(
    'SELECT tutorial_id AS id, completed_at AS completedAt FROM user_tutorial_steps WHERE user_id = ?',
  );
  const etat = db.prepare<[number], EtatJoueur>(
    'SELECT tutorial_completed_at AS completedAt, tutorial_skipped AS skipped FROM users WHERE id = ?',
  );
  const noter = db.prepare<[number, number, number]>(
    'INSERT OR IGNORE INTO user_tutorial_steps (user_id, tutorial_id, completed_at) VALUES (?, ?, ?)',
  );
  const nombreFaites = db
    .prepare<[number], number>('SELECT count(*) FROM user_tutorial_steps WHERE user_id = ?')
    .pluck();
  const terminer = db.prepare<[number, number]>(
    'UPDATE users SET tutorial_completed_at = ? WHERE id = ? AND tutorial_completed_at IS NULL',
  );
  const passer = db.prepare<[number]>('UPDATE users SET tutorial_skipped = 1 WHERE id = ?');
  const portefeuille = db.prepare<[number], Portefeuille>(
    'SELECT cash, premium_currency AS gems FROM users WHERE id = ?',
  );

  function exigerTransaction(action: string): void {
    if (!db.inTransaction) throw new Error(`${action} doit être appelé dans une transaction`);
  }

  function etatDe(moi: number): EtatJoueur {
    const e = etat.get(moi);
    if (!e) throw new Error(`Joueur ${moi} introuvable`);
    return e;
  }

  function lire(moi: number): TutorielReponse {
    const quand = new Map(faites.all(moi).map((f) => [f.id, f.completedAt]));
    const { completedAt, skipped } = etatDe(moi);
    return {
      steps: etapes
        .all()
        .map(({ id, completionEvent: _, ...etape }) => ({ ...etape, completedAt: quand.get(id) ?? null })),
      completedAt,
      skipped: skipped === 1,
    };
  }

  /** Garde l'étape et verse sa récompense, si le tutoriel est en cours et l'étape pas encore faite. */
  function faire(moi: number, etape: LigneEtape, maintenant: number): void {
    const { completedAt, skipped } = etatDe(moi);
    if (completedAt !== null || skipped === 1) return;
    if (noter.run(moi, etape.id, maintenant).changes !== 1) return; // déjà faite
    const ref = { type: 'tutorial', id: etape.id };
    const cle = `tutoriel:${moi}:${etape.key}`;
    if (etape.rewardCash > 0) {
      wallet.apply(db, {
        userId: moi,
        currency: 'cash',
        amount: etape.rewardCash,
        reason: 'tutorial_reward',
        ref,
        idempotencyKey: cle,
      });
    }
    if (etape.rewardGems > 0) {
      wallet.apply(db, {
        userId: moi,
        currency: 'gems',
        amount: etape.rewardGems,
        reason: 'tutorial_reward',
        ref,
        idempotencyKey: `${cle}:gems`,
      });
    }
    if (nombreFaites.get(moi) === etapes.all().length) terminer.run(maintenant, moi);
  }

  return {
    /** GET /tutorial : les étapes dans l'ordre, celles déjà faites, fini ou passé. */
    lire(moi: number): TutorielReponse {
      exigerTransaction('lire');
      return lire(moi);
    },

    /** POST /tutorial/:stepKey/complete : une étape validée par l'écran. */
    completer(moi: number, cle: string, maintenant: number): EtapeFaiteReponse {
      exigerTransaction('completer');
      const etape = etapes.all().find((e) => e.key === cle);
      if (!etape) throw new ErreurMetier('NOT_FOUND', 404, 'Étape du tutoriel inconnue.');
      if (etape.validatedBy !== 'client') {
        throw new ErreurMetier('FORBIDDEN', 403, 'Cette étape se valide toute seule, quand tu fais l’action.');
      }
      faire(moi, etape, maintenant);
      const solde = portefeuille.get(moi);
      if (!solde) throw new Error(`Joueur ${moi} introuvable`);
      return { ...lire(moi), wallet: solde };
    },

    /** POST /tutorial/skip : on ne montre plus le tutoriel ; les étapes non faites ne rapportent rien. */
    passer(moi: number): TutorielReponse {
      exigerTransaction('passer');
      passer.run(moi);
      return lire(moi);
    },

    /** Écouteur du bus : une action du joueur valide les étapes « serveur » qui l'attendent. */
    valider(e: EvenementJeu, maintenant: number): void {
      exigerTransaction('valider');
      for (const etape of etapes.all()) {
        if (etape.validatedBy === 'server' && etape.completionEvent === e.type) faire(e.userId, etape, maintenant);
      }
    },
  };
}
