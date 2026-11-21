import type { Base } from '../../db/connexion.ts';
import { creerQuetes, type EvenementJeu } from '../quests/quetes.ts';

// Bus d'événements interne (docs/06, étape 5) : une action du joueur (achat, chantier fini, encaissement,
// OPA…) prévient ceux qui suivent ces actions, dans la même transaction que l'action elle-même :
// si l'action est annulée, la progression l'est aussi. Aujourd'hui : les quêtes du jour ; le tutoriel suivra.

export type { EvenementJeu } from '../quests/quetes.ts';

type Ecouteur = (e: EvenementJeu, maintenant: number) => void;

/** Les écouteurs de chaque base, créés au premier événement (requêtes SQL préparées une seule fois). */
const ecouteurs = new WeakMap<Base, Ecouteur[]>();

function ecouteursDe(db: Base): Ecouteur[] {
  let liste = ecouteurs.get(db);
  if (!liste) {
    const quetes = creerQuetes(db);
    liste = [(e, maintenant) => quetes.progresser(e, maintenant)];
    ecouteurs.set(db, liste);
  }
  return liste;
}

/** Signale une action ; à appeler dans la transaction de l'action (`db.transaction(...).immediate()`). */
export function emettre(db: Base, e: EvenementJeu, maintenant: number): void {
  if (!db.inTransaction) throw new Error('emettre doit être appelé dans la transaction de l’action');
  for (const ecouteur of ecouteursDe(db)) ecouteur(e, maintenant);
}
