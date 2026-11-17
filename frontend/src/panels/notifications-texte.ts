import type { ContenuOpaTerminee, EvenementDirect, NotificationJeu } from '@france-tycoon/shared';
import type { OngletFiche } from '../etat/carte.ts';
import type { NouveauToast } from '../etat/toasts.ts';
import { phraseChantierFini } from './batiments-texte.ts';
import { tycoons } from './fiche-texte.ts';

// Textes du centre de notifications et des petits messages en direct (docs/04, « Notifications et temps réel »).

/** « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 j ». */
export function ilYa(createdAt: number, maintenant: number): string {
  const s = maintenant - createdAt;
  if (s < 60) return 'à l’instant';
  if (s < 3_600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3_600)} h`;
  return `il y a ${Math.floor(s / 86_400)} j`;
}

const jour = (secondes: number) =>
  new Date(secondes * 1000).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** L'issue d'une OPA vue par moi ; `parMoi` : c'est moi qui l'ai décidée (je le sais déjà). */
export function issueOpa(p: ContenuOpaTerminee): { texte: string; parMoi: boolean } {
  const commune = p.territoryName;
  const autre = p.otherPseudo;
  const attaquant = p.role === 'attacker';
  switch (p.status) {
    case 'defended':
      return attaquant
        ? { texte: `${autre} a défendu ${commune} : ton offre t’est rendue, moins l’indemnité.`, parMoi: false }
        : { texte: `Tu as défendu ${commune} contre ${autre}.`, parMoi: true };
    case 'accepted':
      return attaquant
        ? { texte: `${autre} a accepté ton offre : ${commune} est à toi !`, parMoi: false }
        : { texte: `Tu as vendu ${commune} à ${autre}.`, parMoi: true };
    case 'succeeded':
      return {
        texte: attaquant
          ? `${commune} est à toi : ${autre} n’a pas répondu à ton OPA.`
          : `${commune} est passée à ${autre} : l’OPA est restée sans réponse.`,
        parMoi: false,
      };
    case 'cancelled':
      return attaquant
        ? { texte: `Tu as retiré ton OPA sur ${commune}.`, parMoi: true }
        : {
            texte: `${autre} a retiré son OPA sur ${commune} : tu gardes la commune et touches l’indemnité.`,
            parMoi: false,
          };
    case 'voided':
      return {
        texte: attaquant
          ? `Ton OPA sur ${commune} est annulée : ton offre t’est rendue en entier.`
          : `L’OPA de ${autre} sur ${commune} est annulée.`,
        parMoi: false,
      };
  }
}

/** Un message du centre de notifications, en une phrase. */
export function phraseNotification(n: NotificationJeu): string {
  switch (n.kind) {
    case 'building_done':
      return phraseChantierFini(n.payload);
    case 'takeover_received':
      return `${n.payload.attackerPseudo} lance une OPA sur ${n.payload.territoryName} : ${tycoons(n.payload.offerAmount)} offerts.`;
    case 'takeover_resolved':
      return issueOpa(n.payload).texte;
    case 'inactivity_warning':
      return `Longue absence : tes communes seront libérées le ${jour(n.payload.releaseAt)} si tu ne joues pas d’ici là.`;
    case 'inactivity_released': {
      const { territories, amount } = n.payload;
      const communes = territories > 1 ? `tes ${territories} communes` : 'ta commune';
      return `Après 14 jours d’absence, l’État a racheté ${communes} pour ${tycoons(amount)}. Ton cash est intact.`;
    }
  }
}

/** La commune dont parle le message (un clic y amène), ou `null`. */
export function communeDe(n: NotificationJeu): { insee: string; onglet?: OngletFiche } | null {
  switch (n.kind) {
    case 'building_done':
      return { insee: n.payload.territoryInsee, onglet: 'batiments' };
    case 'takeover_received':
    case 'takeover_resolved':
      return { insee: n.payload.territoryInsee };
    default:
      return null;
  }
}

/**
 * Le petit message à montrer quand un événement arrive en direct, ou `null` :
 * rien pour ce que j'ai fait moi-même (déjà écrit à côté du bouton), ni pour un chantier fini
 * (le résumé « Chantier terminé » s'affiche déjà sous la barre du haut).
 */
export function toastDirect(e: EvenementDirect): NouveauToast | null {
  switch (e.type) {
    case 'takeover.received': {
      const p = e.data.payload;
      return {
        texte: `OPA reçue sur ${p.territoryName} : ${p.attackerPseudo} offre ${tycoons(p.offerAmount)}. Tu as 24 h pour réagir.`,
        ton: 'alerte',
        commune: { insee: p.territoryInsee },
        libelle: 'Réagir',
      };
    }
    case 'takeover.resolved': {
      const issue = issueOpa(e.data.payload);
      if (issue.parMoi) return null;
      return { texte: issue.texte, ton: 'info', commune: { insee: e.data.payload.territoryInsee }, libelle: 'Voir' };
    }
    default:
      return null;
  }
}
