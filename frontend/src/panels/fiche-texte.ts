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

/** Nom de chaque équipement, au singulier et au pluriel, pour la phrase de la fiche. */
const NOMS_EQUIPEMENTS: Record<CategorieInfra, [string, string]> = {
  commerce: ['commerce', 'commerces'],
  service: ['service', 'services'],
  sante: ['lieu de santé', 'lieux de santé'],
  education: ['école', 'écoles'],
  sport_loisir: ['lieu de sport ou de loisirs', 'lieux de sport et de loisirs'],
  hotel: ['hébergement', 'hébergements'],
  restaurant: ['restaurant', 'restaurants'],
  gare: ['gare', 'gares'],
  aeroport: ['aéroport', 'aéroports'],
  port: ['port', 'ports'],
  monument: ['monument historique', 'monuments historiques'],
  musee_attraction: ['musée ou attraction', 'musées et attractions'],
};

/** « 2 commerces, 8 services et 1 école sur 44 km². » */
export function phraseEquipements({ equipments, areaKm2 }: Pick<FicheCommune, 'equipments' | 'areaKm2'>): string {
  const parties = equipments
    .filter((e) => e.count > 0)
    .map((e) => `${nombre.format(e.count)} ${NOMS_EQUIPEMENTS[e.category][e.count > 1 ? 1 : 0]}`);
  const surface = areaKm2 === null ? '' : ` sur ${nombre.format(Math.round(areaKm2))} km²`;
  if (parties.length === 0) return `Aucun équipement recensé${surface}.`;
  const liste = parties.length === 1 ? parties[0] : `${parties.slice(0, -1).join(', ')} et ${parties.at(-1)}`;
  return `${liste}${surface}.`;
}

/** « 6 places de bâtiments libres », ou toutes prises. */
export function phrasePlaces({ used, total }: FicheCommune['buildingSlots']): string {
  const libres = total - used;
  if (libres <= 0) return 'Toutes les places de bâtiments sont prises';
  const s = libres > 1 ? 's' : '';
  return `${libres} place${s} de bâtiment${s} libre${s}`;
}

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
