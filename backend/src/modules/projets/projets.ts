import {
  APPELS_A_PROJETS,
  type AppelAProjets,
  type AppelAProjetsReponse,
  appelDeLaSemaine,
  type ContenuProjetReussi,
  PRIME_PROJET_GEMMES,
  primeProjet,
  prochainLundiParis,
  semaineParis,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import type { EvenementJeu } from '../evenements/bus.ts';
import { creerLecteurRevenus, revenuDuJoueur } from '../income/revenus.ts';
import { wallet } from '../wallet/wallet.ts';

// Appels à projets de l'État (docs/05-equilibrage.md, 5.11) : un objectif commun à tous, du lundi au dimanche
// (heure de Paris). Il avance avec les chantiers finis (bus d'événements) ; réussi, la prime est versée tout de suite.

interface LigneProjet {
  id: number;
  projectCode: string;
  progress: number;
  completedAt: number | null;
  rewardCash: number;
  rewardGems: number;
}

/** Le projet d'une ligne : celui qu'elle a gardé (si la liste change en cours de semaine), sinon celui de la semaine. */
function projetDe(ligne: LigneProjet | undefined, semaine: string): AppelAProjets {
  return APPELS_A_PROJETS.find((p) => p.code === ligne?.projectCode) ?? appelDeLaSemaine(semaine);
}

export function creerAppelsAProjets(db: Base) {
  const lireTerritoires = creerLecteurRevenus(db);
  const lire = db.prepare<[number, string], LigneProjet>(`
    SELECT id, project_code AS projectCode, progress, completed_at AS completedAt,
      reward_cash AS rewardCash, reward_gems AS rewardGems
    FROM user_state_projects WHERE user_id = ? AND week = ?`);
  const creer = db.prepare<[number, string, string]>(
    'INSERT INTO user_state_projects (user_id, week, project_code) VALUES (?, ?, ?)',
  );
  const avancer = db.prepare<[number, number]>('UPDATE user_state_projects SET progress = ? WHERE id = ?');
  const reussir = db.prepare<{ id: number; progres: number; fini: number; cash: number; gemmes: number }>(`
    UPDATE user_state_projects SET progress = @progres, completed_at = @fini, reward_cash = @cash, reward_gems = @gemmes
    WHERE id = @id AND completed_at IS NULL`);
  const notifier = db.prepare<[number, string, number]>(
    "INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, 'project_completed', ?, ?)",
  );

  const revenu = (moi: number, maintenant: number) => revenuDuJoueur([...lireTerritoires(moi).values()], maintenant);

  return {
    /** GET /me/state-project : le projet de la semaine et où en est le joueur. */
    semaine(moi: number, maintenant: number): AppelAProjetsReponse {
      const week = semaineParis(maintenant);
      const ligne = lire.get(moi, week);
      const p = projetDe(ligne, week);
      const reussi = ligne !== undefined && ligne.completedAt !== null;
      return {
        week,
        endsAt: prochainLundiParis(maintenant),
        project: {
          code: p.code,
          title: p.title,
          description: p.description.replaceAll('{target}', String(p.target)),
          target: p.target,
          progress: Math.min(p.target, ligne?.progress ?? 0),
          rewardCash: reussi ? ligne.rewardCash : primeProjet(revenu(moi, maintenant)),
          rewardGems: reussi ? ligne.rewardGems : PRIME_PROJET_GEMMES,
          completedAt: ligne?.completedAt ?? null,
        },
      };
    },

    /** Écouteur du bus : un chantier fini qui compte fait avancer le projet ; réussi, prime versée et message. */
    progresser(e: EvenementJeu, maintenant: number): void {
      if (!db.inTransaction) throw new Error('progresser doit être appelé dans une transaction');
      if (e.type !== 'building_started' && e.type !== 'building_upgraded') return;
      const week = semaineParis(maintenant);
      let ligne = lire.get(e.userId, week);
      const p = projetDe(ligne, week);
      if (e.type !== p.eventType || (p.buildingType !== undefined && e.kind !== p.buildingType)) return;
      if (!ligne) {
        creer.run(e.userId, week, p.code);
        ligne = lire.get(e.userId, week);
      }
      if (!ligne || ligne.completedAt !== null) return;

      const progres = Math.min(p.target, ligne.progress + 1);
      if (progres < p.target) {
        avancer.run(progres, ligne.id);
        return;
      }
      const cash = primeProjet(revenu(e.userId, maintenant));
      const gemmes = PRIME_PROJET_GEMMES;
      if (reussir.run({ id: ligne.id, progres, fini: maintenant, cash, gemmes }).changes !== 1) {
        throw new Error(`Appel à projets ${ligne.id} : réussite ratée`);
      }
      const ref = { type: 'state_project', id: ligne.id };
      wallet.apply(db, { userId: e.userId, currency: 'cash', amount: cash, reason: 'quest_reward', ref });
      if (gemmes > 0) {
        wallet.apply(db, { userId: e.userId, currency: 'gems', amount: gemmes, reason: 'quest_reward', ref });
      }
      const contenu: ContenuProjetReussi = { code: p.code, title: p.title, rewardCash: cash, rewardGems: gemmes };
      notifier.run(e.userId, JSON.stringify(contenu), maintenant);
    },
  };
}
