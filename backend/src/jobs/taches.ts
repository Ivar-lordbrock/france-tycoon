import type { FastifyBaseLogger } from 'fastify';
import type { Base } from '../db/connexion.ts';
import { creerInactivite } from '../modules/inactivity/inactivite.ts';
import { creerEncaisseurSimple } from '../modules/income/revenus.ts';
import { creerIssuesOpa } from '../modules/takeovers/issues.ts';

// Tâches planifiées (docs/02, 2.6), dans le même processus que l'API. Chaque tâche appelle la même
// fonction que la lecture, et laisse une ligne dans `job_runs` (verrou : une seule exécution à la fois).

/** On garde 7 jours d'historique par tâche (une ligne par minute pour `resolve-takeovers`). */
const HISTORIQUE_S = 7 * 86_400;

export interface Tache {
  nom: string;
  /** Intervalle entre deux exécutions, en secondes. */
  toutesLes: number;
  /** Le travail ; renvoie un petit résumé gardé dans `job_runs.details`. */
  executer: (maintenant: number) => Record<string, unknown>;
}

export function creerTaches(db: Base): Tache[] {
  const { resoudreEchues } = creerIssuesOpa(db, creerEncaisseurSimple(db));
  const { avertir, libererAbsents } = creerInactivite(db);
  return [
    { nom: 'resolve-takeovers', toutesLes: 60, executer: (maintenant) => ({ resolved: resoudreEchues(maintenant) }) },
    // Toutes les heures plutôt qu'à heure fixe : chaque passage ne traite que ceux qui ont passé le cap.
    { nom: 'warn-inactive', toutesLes: 3_600, executer: (maintenant) => ({ warned: avertir(maintenant) }) },
    { nom: 'release-inactive', toutesLes: 3_600, executer: (maintenant) => ({ released: libererAbsents(maintenant) }) },
  ];
}

/**
 * Exécute une tâche une fois, avec sa ligne dans `job_runs`. Renvoie `false` si elle tourne déjà
 * (l'index unique `uq_job_runs_one_running` refuse une deuxième ligne `running`).
 */
export function executerTache(db: Base, tache: Tache, maintenant: number): boolean {
  let id: number;
  try {
    id = db
      .prepare<[string, number], number>(
        "INSERT INTO job_runs (job_name, started_at, status) VALUES (?, ?, 'running') RETURNING id",
      )
      .pluck()
      .get(tache.nom, maintenant) as number;
  } catch (erreur) {
    if (erreur instanceof Error && 'code' in erreur && erreur.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
    throw erreur;
  }
  const finir = db.prepare<[string, string, number]>(
    'UPDATE job_runs SET status = ?, details = ?, finished_at = unixepoch() WHERE id = ?',
  );
  try {
    const resume = tache.executer(maintenant);
    finir.run('ok', JSON.stringify(resume), id);
  } catch (erreur) {
    finir.run('error', JSON.stringify({ message: erreur instanceof Error ? erreur.message : String(erreur) }), id);
    throw erreur;
  } finally {
    db.prepare<[string, number]>(
      "DELETE FROM job_runs WHERE job_name = ? AND started_at < ? AND status <> 'running'",
    ).run(tache.nom, maintenant - HISTORIQUE_S);
  }
  return true;
}

/** Lance les tâches (une première fois tout de suite) ; renvoie de quoi les arrêter. */
export function demarrerTaches(db: Base, log: FastifyBaseLogger, taches = creerTaches(db)): () => void {
  const lancer = (tache: Tache) => {
    try {
      executerTache(db, tache, Math.floor(Date.now() / 1000));
    } catch (erreur) {
      log.error({ err: erreur, tache: tache.nom }, 'tâche planifiée en échec');
    }
  };
  const minuteurs = taches.map((tache) => {
    lancer(tache);
    return setInterval(() => lancer(tache), tache.toutesLes * 1000);
  });
  return () => {
    for (const m of minuteurs) clearInterval(m);
  };
}
