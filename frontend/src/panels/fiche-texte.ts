import {
  type CategorieInfra,
  type CodeErreur,
  type FicheCommune,
  type MoiReponse,
  NOMS_ZONES,
} from '@france-tycoon/shared';

const nombre = new Intl.NumberFormat('fr-FR');

export const tycoons = (montant: number) => `${nombre.format(montant)} ₮`;
export const entier = (n: number) => nombre.format(n);

export const LIBELLES_EQUIPEMENTS: Record<CategorieInfra, string> = {
  commerce: 'Commerces',
  service: 'Services',
  sante: 'Santé',
  education: 'Écoles',
  sport_loisir: 'Sports et loisirs',
  hotel: 'Hébergements',
  restaurant: 'Restaurants',
  gare: 'Gares',
  aeroport: 'Aéroports',
  port: 'Ports',
  monument: 'Monuments historiques',
  musee_attraction: 'Musées et attractions',
};

/** Sous le nom : département (Métropole) ou zone d'outre-mer. */
export function lieu(fiche: Pick<FicheCommune, 'zone' | 'department'>): string {
  return fiche.zone === 'MET' ? `Département ${fiche.department}` : NOMS_ZONES[fiche.zone];
}

const heure = (secondes: number) =>
  new Date(secondes * 1000).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** À qui est la commune, en une ligne. */
export function proprietaire(fiche: Pick<FicheCommune, 'state' | 'owner' | 'shieldUntil'>): string {
  const pseudo = fiche.owner?.pseudo ?? 'un joueur';
  switch (fiche.state) {
    case 'free':
      return 'Libre';
    case 'mine':
      return fiche.shieldUntil ? `À toi, sous bouclier jusqu’à ${heure(fiche.shieldUntil)}` : 'À toi';
    case 'rival':
      return `À ${pseudo}`;
    case 'shield':
      return fiche.shieldUntil
        ? `À ${fiche.owner?.isMe ? 'toi' : pseudo}, sous bouclier jusqu’à ${heure(fiche.shieldUntil)}`
        : `À ${pseudo}, sous bouclier`;
    case 'takeover':
      return `À ${fiche.owner?.isMe ? 'toi' : pseudo}, OPA en cours`;
  }
}

/** Pourquoi on ne peut pas acheter, en clair ; `null` quand le propriétaire suffit à l'expliquer. */
export function raisonAchat(code: CodeErreur, fiche: FicheCommune, moi: MoiReponse | null): string | null {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Connecte-toi pour l’acheter.';
    case 'TERRITORY_NOT_FREE':
      return null;
    case 'TERRITORY_LIMIT_REACHED':
      return moi
        ? `Tu as déjà ${moi.territories.owned} territoires sur ${moi.territories.max}.`
        : 'Limite de territoires atteinte.';
    case 'INSUFFICIENT_FUNDS': {
      const manque = (fiche.actions.buyPrice ?? fiche.baseValue) - (moi?.wallet.cash ?? 0);
      return manque > 0 ? `Il te manque ${tycoons(manque)}.` : 'Pas assez de cash.';
    }
    default:
      return 'Achat impossible pour le moment.';
  }
}
