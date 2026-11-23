import {
  type AchatReponse,
  BOUCLIER_ACHAT_S,
  type CodeErreur,
  type FicheCommune,
  type Portefeuille,
  prixAchat,
  prixVenteEtat,
  type VenteReponse,
  valeurTerritoire,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { emettre } from '../evenements/bus.ts';
import { creerEncaisseur } from '../income/revenus.ts';
import { creerLecteurReglages } from '../reglages/calendrier.ts';
import { mouvementDejaFait } from '../wallet/idempotence.ts';
import { wallet } from '../wallet/wallet.ts';

// Achat d'une commune libre et vente à l'État (docs/05, 5.4). Les mêmes règles servent
// aux actions possibles de la fiche (`raisonsAchat`, `raisonsVente`) et aux routes.

export interface JoueurAchat {
  cash: number;
  maxTerritories: number;
  /** Territoires possédés + OPA sortantes en cours (une place réservée chacune). */
  occupes: number;
}

/** Cash, limite et places occupées d'un joueur, pour savoir s'il peut acheter. */
export function creerLecteurJoueurAchat(db: Base) {
  return db.prepare<[number], JoueurAchat>(`
    SELECT u.cash, u.max_territories AS maxTerritories,
      (SELECT count(*) FROM territories WHERE owner_id = u.id)
        + (SELECT count(*) FROM takeovers WHERE attacker_id = u.id AND status = 'pending') AS occupes
    FROM users AS u WHERE u.id = ?`);
}

/** Ce qui empêche `moi` d'acheter une commune au prix `prix` (vide : achat possible). */
export function raisonsAchat(
  ownerId: number | null,
  moi: number | null,
  joueur: JoueurAchat | undefined,
  prix: number,
): CodeErreur[] {
  const raisons: CodeErreur[] = [];
  if (ownerId !== null) raisons.push('TERRITORY_NOT_FREE');
  if (moi === null) raisons.push('UNAUTHENTICATED');
  else if (ownerId === null && joueur) {
    if (joueur.occupes >= joueur.maxTerritories) raisons.push('TERRITORY_LIMIT_REACHED');
    if (joueur.cash < prix) raisons.push('INSUFFICIENT_FUNDS');
  }
  return raisons;
}

/** Ce qui empêche `moi` de vendre une commune à l'État (vide : vente possible). */
export function raisonsVente(
  ownerId: number | null,
  moi: number | null,
  estCapitale: boolean,
  opaEnCours: boolean,
): CodeErreur[] {
  if (moi === null) return ['UNAUTHENTICATED'];
  if (ownerId !== moi) return ['FORBIDDEN'];
  const raisons: CodeErreur[] = [];
  if (estCapitale) raisons.push('CAPITAL_IMMUNE');
  if (opaEnCours) raisons.push('TAKEOVER_ALREADY_PENDING');
  return raisons;
}

interface LigneCommune {
  id: number;
  baseValue: number;
  /** Prix forcé par un admin ; `null` : V0 × réglage des prix. */
  forcedPrice: number | null;
  ownerId: number | null;
  isCapital: number;
  fortification: number;
}

type LireFiche = (insee: string, moi: number | null, maintenant: number) => FicheCommune | null;

/** Les deux actions, avec leurs requêtes préparées une fois. */
export function creerAchatVente(db: Base, lireFiche: LireFiche) {
  const commune = db.prepare<[string], LigneCommune>(`
    SELECT id, base_value AS baseValue, forced_price AS forcedPrice, owner_id AS ownerId, is_capital AS isCapital,
      fortification_value AS fortification
    FROM territories WHERE insee_code = ?`);
  const lireJoueur = creerLecteurJoueurAchat(db);
  const opaEnCours = db
    .prepare<[number], number>("SELECT 1 FROM takeovers WHERE territory_id = ? AND status = 'pending'")
    .pluck();
  const investi = db
    .prepare<[number], number>('SELECT coalesce(sum(invested_cash), 0) FROM buildings WHERE territory_id = ?')
    .pluck();
  const prendre = db.prepare<{ id: number; moi: number; maintenant: number; prix: number; bouclier: number }>(`
    UPDATE territories SET owner_id = @moi, acquired_at = @maintenant, acquired_price = @prix,
      shield_until = @bouclier, fortification_value = 0, is_capital = 0
    WHERE id = @id AND owner_id IS NULL`);
  const liberer = db.prepare<[number, number]>(`
    UPDATE territories SET owner_id = NULL, acquired_at = NULL, acquired_price = NULL,
      shield_until = NULL, fortification_value = 0, is_capital = 0
    WHERE id = ? AND owner_id = ?`);
  const detruireBatiments = db.prepare<[number]>('DELETE FROM buildings WHERE territory_id = ?');
  const noterHistorique = db.prepare<[number, number | null, number | null, 'purchase' | 'sale', number, number]>(`
    INSERT INTO territory_ownership_history (territory_id, from_user_id, to_user_id, reason, price, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const portefeuille = db.prepare<[number], Portefeuille>(
    'SELECT cash, premium_currency AS gems FROM users WHERE id = ?',
  );
  const encaisser = creerEncaisseur(db);
  const reglages = creerLecteurReglages(db);

  function trouver(insee: string): LigneCommune {
    const c = commune.get(insee);
    if (!c) throw new ErreurMetier('TERRITORY_NOT_FOUND', 404, `Aucune commune française avec le code ${insee}.`);
    return c;
  }

  /** Une clé déjà servie pour une autre commune est une erreur du client, pas un rejeu. */
  function rejeu(cle: string | undefined, territoireId: number): { amount: number } | undefined {
    const deja = mouvementDejaFait(db, cle);
    if (deja && deja.refId !== territoireId) {
      throw new ErreurMetier('VALIDATION_ERROR', 400, 'Cette clé Idempotency-Key a déjà servi pour une autre commune.');
    }
    return deja;
  }

  function lirePortefeuille(moi: number): Portefeuille {
    const p = portefeuille.get(moi);
    if (!p) throw new Error(`Joueur inconnu : ${moi}`);
    return p;
  }

  /** POST /territories/:insee/buy : prix = V0 × réglage (ou prix forcé par un admin), bouclier de 12 h. */
  function acheter(moi: number, insee: string, maintenant: number, cle?: string): AchatReponse {
    db.transaction(() => {
      encaisser(moi, maintenant); // encaisse d'abord : les revenus en attente comptent pour payer
      const c = trouver(insee);
      if (rejeu(cle, c.id)) return; // déjà acheté avec cette clé : on renvoie l'état actuel
      const prix = prixAchat(c.baseValue, reglages(maintenant).price, c.forcedPrice);
      const joueur = lireJoueur.get(moi);
      // Le manque d'argent est signalé par wallet.apply, avec la somme qui manque.
      const [raison] = raisonsAchat(c.ownerId, moi, joueur, prix).filter((r) => r !== 'INSUFFICIENT_FUNDS');
      if (raison === 'TERRITORY_NOT_FREE') {
        const message =
          c.ownerId === moi ? 'Cette commune est déjà à toi.' : 'Cette commune appartient déjà à un joueur.';
        throw new ErreurMetier(raison, 409, message);
      }
      if (raison === 'TERRITORY_LIMIT_REACHED' && joueur) {
        throw new ErreurMetier(raison, 409, `Tu as déjà ${joueur.occupes} territoires sur ${joueur.maxTerritories}.`);
      }
      wallet.apply(db, {
        userId: moi,
        currency: 'cash',
        amount: -prix,
        reason: 'territory_purchase',
        ref: { type: 'territory', id: c.id },
        idempotencyKey: cle,
      });
      const pris = prendre.run({
        id: c.id,
        moi,
        maintenant,
        prix,
        bouclier: maintenant + BOUCLIER_ACHAT_S,
      });
      if (pris.changes !== 1) throw new Error(`Achat de ${insee} : la commune n'était plus libre`);
      noterHistorique.run(c.id, null, moi, 'purchase', prix, maintenant);
      emettre(db, { userId: moi, type: 'territory_bought' }, maintenant);
    }).immediate();

    const territory = lireFiche(insee, moi, maintenant);
    if (!territory) throw new Error(`Commune ${insee} disparue après l'achat`);
    return { territory, wallet: lirePortefeuille(moi) };
  }

  /** POST /territories/:insee/sell : 70 % de V_T à l'État ; les bâtiments sont détruits, chantier compris. */
  function vendre(moi: number, insee: string, maintenant: number, cle?: string): VenteReponse {
    const saleAmount = db
      .transaction((): number => {
        encaisser(moi, maintenant); // encaisse d'abord, avant que la commune et ses bâtiments ne partent
        const c = trouver(insee);
        const deja = rejeu(cle, c.id);
        if (deja) return deja.amount;
        const [raison] = raisonsVente(c.ownerId, moi, c.isCapital === 1, opaEnCours.get(c.id) !== undefined);
        if (raison === 'FORBIDDEN') throw new ErreurMetier(raison, 403, 'Cette commune n’est pas à toi.');
        if (raison === 'CAPITAL_IMMUNE') {
          throw new ErreurMetier(
            raison,
            409,
            'Ta capitale ne se vend pas : déplace-la d’abord dans une autre commune.',
          );
        }
        if (raison === 'TAKEOVER_ALREADY_PENDING') {
          throw new ErreurMetier(raison, 409, 'Une OPA est en cours sur cette commune : tu ne peux pas la vendre.');
        }

        const montant = prixVenteEtat(valeurTerritoire(c.baseValue, investi.get(c.id) ?? 0, c.fortification));
        detruireBatiments.run(c.id);
        if (liberer.run(c.id, moi).changes !== 1) throw new Error(`Vente de ${insee} : la commune n'était plus à toi`);
        noterHistorique.run(c.id, moi, null, 'sale', montant, maintenant);
        if (montant > 0) {
          wallet.apply(db, {
            userId: moi,
            currency: 'cash',
            amount: montant,
            reason: 'territory_sale',
            ref: { type: 'territory', id: c.id },
            idempotencyKey: cle,
          });
        }
        return montant;
      })
      .immediate();

    return { insee, saleAmount, wallet: lirePortefeuille(moi) };
  }

  return { acheter, vendre };
}
