import type { EvenementDirect, NotificationJeu } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerEncaisseur, creerEncaisseurSimple } from '../income/revenus.ts';
import { creerIssuesOpa } from '../takeovers/issues.ts';
import { COLONNES_NOTIFICATION, type LigneNotification, versNotification } from './liste.ts';

// Flux en direct GET /events (SSE, docs/04). La table `notifications` sert de file d'attente :
// tant qu'un joueur écoute, `tic` passe chaque seconde. Il termine d'abord ce qui est dû pour ceux qui
// regardent (OPA échues, chantiers finis), puis envoie les messages écrits depuis le passage d'avant.
// Relire la table garantit qu'on n'envoie que ce qui est enregistré (rien d'une transaction annulée),
// quelle que soit la route ou la tâche qui a écrit le message.

/** Un onglet ouvert sur le flux. */
export interface Flux {
  ecrire(texte: string): void;
  fermer(): void;
}

/** Au-delà, l'onglet le plus ancien du joueur est fermé : un front qui boucle ne remplit pas la mémoire. */
export const FLUX_MAX_PAR_JOUEUR = 5;
/** Un commentaire toutes les 25 s : les proxys ne coupent pas une connexion qui parle. */
export const BATTEMENT_S = 25;

/** Une trame SSE : `event: <type>`, `data: <JSON>`, puis une ligne vide. */
export function trame(evenement: EvenementDirect): string {
  return `event: ${evenement.type}\ndata: ${JSON.stringify(evenement.data)}\n\n`;
}

/** L'événement d'un message, ou `null` pour les types qui n'en ont pas (inactivité). */
function evenementDuMessage(message: NotificationJeu): EvenementDirect | null {
  switch (message.kind) {
    case 'building_done':
      return { type: 'building.done', data: message };
    case 'takeover_received':
      return { type: 'takeover.received', data: message };
    case 'takeover_resolved':
      return { type: 'takeover.resolved', data: message };
    case 'quest_completed':
      return { type: 'quest.completed', data: message };
    case 'rank_up':
      return { type: 'rank.up', data: message };
    default:
      return null;
  }
}

/** Messages qui changent le cash ou le revenu sans que le joueur agisse : suivis de `wallet.changed`. */
const BOUGENT_LE_PORTEFEUILLE = new Set(['takeover_resolved', 'inactivity_released']);

export function creerDirect(db: Base) {
  const abonnes = new Map<number, Flux[]>();
  /** Dernier message déjà traité. */
  let curseur = 0;
  let dernierBattement = 0;

  const dernierId = db.prepare<[], number>('SELECT coalesce(max(id), 0) FROM notifications').pluck();
  const nouveaux = db.prepare<[number], LigneNotification & { userId: number }>(
    `SELECT ${COLONNES_NOTIFICATION}, user_id AS userId FROM notifications WHERE id > ? ORDER BY id LIMIT 1000`,
  );
  const chantiersFinis = db
    .prepare<{ ids: string; maintenant: number }, number>(`
      SELECT DISTINCT t.owner_id FROM territories AS t JOIN buildings AS b ON b.territory_id = t.id
      WHERE t.owner_id IN (SELECT value FROM json_each(@ids)) AND b.works_ends_at <= @maintenant`)
    .pluck();
  const gemmes = db.prepare<[number], number>('SELECT premium_currency FROM users WHERE id = ?').pluck();
  const encaisser = creerEncaisseur(db);
  const { resoudreEchues } = creerIssuesOpa(db, creerEncaisseurSimple(db));

  function envoyer(userId: number, texte: string) {
    for (const flux of abonnes.get(userId) ?? []) flux.ecrire(texte);
  }

  /** Nouveau solde et revenu, après encaissement (même base que GET /me pour le cash qui monte). */
  function portefeuille(userId: number, maintenant: number): EvenementDirect {
    return db
      .transaction((): EvenementDirect => {
        const { cash, incomePerHour } = encaisser(userId, maintenant);
        return { type: 'wallet.changed', data: { cash, gems: gemmes.get(userId) ?? 0, incomePerHour } };
      })
      .immediate();
  }

  return {
    /** Branche un onglet ; renvoie la fonction qui le débranche (connexion fermée). */
    abonner(userId: number, flux: Flux): () => void {
      if (abonnes.size === 0) curseur = dernierId.get() ?? 0; // personne n'écoutait : on part d'ici
      const onglets = abonnes.get(userId) ?? [];
      onglets.push(flux);
      abonnes.set(userId, onglets);
      if (onglets.length > FLUX_MAX_PAR_JOUEUR) onglets.shift()?.fermer();
      return () => {
        const reste = (abonnes.get(userId) ?? []).filter((f) => f !== flux);
        if (reste.length > 0) abonnes.set(userId, reste);
        else abonnes.delete(userId);
      };
    },

    /** Nombre de joueurs qui écoutent (le minuteur s'arrête à 0). */
    ecoutants: () => abonnes.size,

    tic(maintenant: number): void {
      if (abonnes.size === 0) return;

      // 1. Ce qui est dû pour ceux qui regardent, à la seconde près.
      resoudreEchues(maintenant);
      for (const userId of chantiersFinis.all({ ids: JSON.stringify([...abonnes.keys()]), maintenant })) {
        db.transaction(() => encaisser(userId, maintenant)).immediate();
      }

      // 2. Les messages écrits depuis le passage d'avant, à ceux qui écoutent.
      const portefeuillesBouges = new Set<number>();
      for (const { userId, ...ligne } of nouveaux.all(curseur)) {
        curseur = ligne.id;
        if (!abonnes.has(userId)) continue;
        const evenement = evenementDuMessage(versNotification(ligne));
        if (evenement) envoyer(userId, trame(evenement));
        if (BOUGENT_LE_PORTEFEUILLE.has(ligne.kind)) portefeuillesBouges.add(userId);
      }

      // 3. Un seul nouveau solde par joueur, après ses messages.
      for (const userId of portefeuillesBouges) envoyer(userId, trame(portefeuille(userId, maintenant)));

      if (maintenant - dernierBattement >= BATTEMENT_S) {
        dernierBattement = maintenant;
        for (const userId of abonnes.keys()) envoyer(userId, ': ping\n\n');
      }
    },

    /** Ferme tous les onglets (arrêt du serveur). */
    fermerTout(): void {
      const tous = [...abonnes.values()].flat();
      abonnes.clear();
      for (const flux of tous) flux.fermer();
    },
  };
}
