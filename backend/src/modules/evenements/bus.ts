import type { EvenementQuete } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerAppelsAProjets } from '../projets/projets.ts';
import { creerQuetes } from '../quests/quetes.ts';
import { creerTutoriel } from '../tutorial/tutoriel.ts';

// Bus d'événements interne (docs/06, étape 5) : une action du joueur (achat, chantier fini, encaissement,
// OPA…) prévient ceux qui suivent ces actions, dans la même transaction que l'action elle-même :
// si l'action est annulée, la progression l'est aussi. Écouteurs : les quêtes du jour, le tutoriel
// et l'appel à projets de la semaine.

/** Une action du joueur, telle que la voient les quêtes et le tutoriel. */
export interface EvenementJeu {
  userId: number;
  type: EvenementQuete;
  /** Ce qui ne compte qu'une fois par quête : code INSEE, zone, heure d'encaissement. */
  ref?: string;
  /** Encaissement : ce qui a été encaissé (« Trésorier » ne compte pas un clic qui ne rapporte rien). */
  montant?: number;
  /** Chantier fini : le type de bâtiment (`building_types.code`), pour les appels à projets. */
  kind?: string;
  /**
   * Tirer les quêtes du jour si ce n'est pas encore fait. Faux quand le joueur n'agit pas lui-même
   * (chantier fini pendant son absence) : seules les quêtes déjà tirées avancent.
   */
  tirer?: boolean;
}

type Ecouteur = (e: EvenementJeu, maintenant: number) => void;

/** Les écouteurs de chaque base, créés au premier événement (requêtes SQL préparées une seule fois). */
const ecouteurs = new WeakMap<Base, Ecouteur[]>();

function ecouteursDe(db: Base): Ecouteur[] {
  let liste = ecouteurs.get(db);
  if (!liste) {
    const quetes = creerQuetes(db);
    const tutoriel = creerTutoriel(db);
    const projets = creerAppelsAProjets(db);
    liste = [
      (e, maintenant) => quetes.progresser(e, maintenant),
      (e, maintenant) => tutoriel.valider(e, maintenant),
      (e, maintenant) => projets.progresser(e, maintenant),
    ];
    ecouteurs.set(db, liste);
  }
  return liste;
}

/** Signale une action ; à appeler dans la transaction de l'action (`db.transaction(...).immediate()`). */
export function emettre(db: Base, e: EvenementJeu, maintenant: number): void {
  if (!db.inTransaction) throw new Error('emettre doit être appelé dans la transaction de l’action');
  for (const ecouteur of ecouteursDe(db)) ecouteur(e, maintenant);
}
