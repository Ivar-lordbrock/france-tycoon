import {
  type ContenuOpaRecue,
  DELAI_REPONSE_OPA_S,
  type DevisOpa,
  type OpaReponse,
  type Portefeuille,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { emettre } from '../evenements/bus.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { mouvementDejaFait } from '../wallet/idempotence.ts';
import { wallet } from '../wallet/wallet.ts';
import { type CommuneOpa, codesRefus, creerEvaluationOpa } from './conditions.ts';
import { creerLecteurOpa } from './lecture.ts';

// Devis et lancement d'une OPA (docs/04 « PvP : OPA », docs/05 5.5). Défendre, accepter, retirer
// et la résolution au bout de 24 h arrivent au paquet suivant.

interface LigneCommune extends CommuneOpa {
  insee: string;
  name: string;
}

export function creerLancementOpa(db: Base) {
  const commune = db.prepare<[string], LigneCommune>(`
    SELECT t.id, t.insee_code AS insee, t.name, t.owner_id AS ownerId, t.is_capital AS isCapital,
      t.shield_until AS shieldUntil, t.base_value AS baseValue, t.fortification_value AS fortification,
      coalesce((SELECT sum(invested_cash) FROM buildings WHERE territory_id = t.id), 0) AS investi
    FROM territories AS t WHERE t.insee_code = ?`);
  const creer = db
    .prepare<Record<string, number>, number>(`
      INSERT INTO takeovers (territory_id, attacker_id, defender_id, territory_value, offer_amount, defense_cost,
        break_fee, created_at, expires_at)
      VALUES (@territoire, @attaquant, @defenseur, @valeur, @offre, @defense, @indemnite, @maintenant, @fin)
      RETURNING id`)
    .pluck();
  const notifier = db.prepare<[number, string, number]>(
    "INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, 'takeover_received', ?, ?)",
  );
  // Attaquer fait perdre sa propre protection débutant (5.5).
  const finProtection = db.prepare<[number, number, number]>(
    'UPDATE users SET newbie_shield_until = ? WHERE id = ? AND newbie_shield_until > ?',
  );
  const pseudo = db.prepare<[number], string>('SELECT pseudo FROM users WHERE id = ?').pluck();
  const portefeuille = db.prepare<[number], Portefeuille>(
    'SELECT cash, premium_currency AS gems FROM users WHERE id = ?',
  );
  const evaluer = creerEvaluationOpa(db);
  const lireOpa = creerLecteurOpa(db);
  const encaisser = creerEncaisseur(db);

  function trouver(insee: string): LigneCommune {
    const c = commune.get(insee);
    if (!c) throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune française avec le code ${insee}.`);
    return c;
  }

  /** GET /territories/:insee/takeover-quote : les montants qui seraient figés maintenant, et les refus. */
  function devis(moi: number, insee: string, maintenant: number): DevisOpa {
    return db
      .transaction((): DevisOpa => {
        encaisser(moi, maintenant); // encaisse d'abord : les revenus en attente comptent pour payer l'offre
        const { valeur, montants, refus } = evaluer(moi, trouver(insee), maintenant);
        const reasons = codesRefus(refus);
        return {
          territoryValue: valeur,
          offerAmount: montants.offre,
          defenseCost: montants.defense,
          breakFee: montants.indemnite,
          eligible: reasons.length === 0,
          reasons,
        };
      })
      .immediate();
  }

  /** POST /territories/:insee/takeovers : l'offre part en séquestre, le défenseur a 24 h pour réagir. */
  function lancer(moi: number, insee: string, maintenant: number, cle?: string): OpaReponse {
    const id = db
      .transaction((): number => {
        encaisser(moi, maintenant);
        const c = trouver(insee);

        const deja = mouvementDejaFait(db, cle);
        if (deja) {
          // Déjà lancée avec cette clé : on renvoie la même OPA (une clé pour une autre commune est une erreur).
          const opa = deja.refId === null ? null : lireOpa(deja.refId, moi);
          if (!opa || opa.territory.insee !== c.insee) {
            throw new ErreurMetier(
              'VALIDATION_ERROR',
              400,
              'Cette clé Idempotency-Key a déjà servi pour une autre commune.',
            );
          }
          return opa.id;
        }

        const { valeur, montants, refus } = evaluer(moi, c, maintenant);
        // Le manque d'argent est signalé par wallet.apply, avec la somme qui manque.
        const bloquant = refus.find((r) => r.code !== 'INSUFFICIENT_FUNDS');
        if (bloquant) throw new ErreurMetier(bloquant.code, bloquant.statut, bloquant.message, bloquant.details);
        if (c.ownerId === null) throw new Error(`OPA sur ${insee} : commune libre`);

        const fin = maintenant + DELAI_REPONSE_OPA_S;
        const opa = creer.get({
          territoire: c.id,
          attaquant: moi,
          defenseur: c.ownerId,
          valeur,
          offre: montants.offre,
          defense: montants.defense,
          indemnite: montants.indemnite,
          maintenant,
          fin,
        });
        if (opa === undefined) throw new Error(`OPA sur ${insee} : création impossible`);
        wallet.apply(db, {
          userId: moi,
          currency: 'cash',
          amount: -montants.offre,
          reason: 'takeover_escrow',
          ref: { type: 'takeover', id: opa },
          idempotencyKey: cle,
        });
        finProtection.run(maintenant, moi, maintenant);
        const contenu: ContenuOpaRecue = {
          takeoverId: opa,
          territoryInsee: c.insee,
          territoryName: c.name,
          attackerPseudo: pseudo.get(moi) ?? '',
          offerAmount: montants.offre,
          defenseCost: montants.defense,
          expiresAt: fin,
        };
        notifier.run(c.ownerId, JSON.stringify(contenu), maintenant);
        emettre(db, { userId: moi, type: 'takeover_launched' }, maintenant);
        return opa;
      })
      .immediate();

    const takeover = lireOpa(id, moi);
    const solde = portefeuille.get(moi);
    if (!takeover || !solde) throw new Error(`OPA ${id} introuvable après le lancement`);
    return { takeover, wallet: solde };
  }

  return { devis, lancer };
}
