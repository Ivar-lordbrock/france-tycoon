// Constantes et formules d'équilibrage : seul endroit où elles vivent (avec la table `building_types`).
// Toute modification ici se reporte dans docs/05-equilibrage.md.
// Étape 1 : section 5.1 (valeur d'une commune), utilisée par scripts/import/communes.
// Étape 2 : capital de départ, protection débutant, revenu du sol (5.3), valeur d'un territoire (5.4).
// Étape 3 : bâtiments (5.2), revenus et calcul hors ligne (5.3), vente, limites de territoires (5.4).
// Étape 4 : OPA (5.5), patrimoine (5.4) et inactivité (5.6).
// Étape 5 : rangs (5.4), quêtes du jour et jour de Paris (5.7).

/** À incrémenter quand une formule change : `territories.balance_version` dit quelles valeurs sont à recalculer. */
export const BALANCE_VERSION = 1;

export const CATEGORIES_INFRA = [
  'commerce',
  'service',
  'sante',
  'education',
  'sport_loisir',
  'hotel',
  'restaurant',
  'gare',
  'aeroport',
  'port',
  'monument',
  'musee_attraction',
] as const;

export type CategorieInfra = (typeof CATEGORIES_INFRA)[number];

/** Poids w_k du score d'infrastructures (5.1). */
export const POIDS_INFRA: Record<CategorieInfra, number> = {
  commerce: 1,
  service: 1,
  sante: 2,
  education: 2,
  sport_loisir: 1,
  hotel: 2,
  restaurant: 1,
  gare: 40,
  aeroport: 150,
  port: 60,
  monument: 12,
  musee_attraction: 8,
};

/** Catégories comptées uniquement depuis OpenStreetMap (la BPE ne les couvre pas assez bien). */
const TOUJOURS_OSM: ReadonlySet<CategorieInfra> = new Set(['gare', 'aeroport', 'port', 'monument', 'musee_attraction']);

export type ComptesInfra = Partial<Record<CategorieInfra, { bpe?: number; osm?: number }>>;

export interface EquipementRetenu {
  category: CategorieInfra;
  count: number;
  source: 'bpe' | 'osm';
}

/**
 * Le compte retenu pour chaque catégorie : BPE en priorité (Métropole, DROM), OSM sinon (COM) ;
 * gares, aéroports, ports, monuments et musées toujours depuis OSM. Les catégories à 0 sont omises.
 */
export function equipementsRetenus(comptes: ComptesInfra): EquipementRetenu[] {
  const retenus: EquipementRetenu[] = [];
  for (const category of CATEGORIES_INFRA) {
    const { bpe, osm } = comptes[category] ?? {};
    const source = TOUJOURS_OSM.has(category) || bpe === undefined ? 'osm' : 'bpe';
    const count = (source === 'bpe' ? bpe : osm) ?? 0;
    if (count > 0) retenus.push({ category, count, source });
  }
  return retenus;
}

/** Score d'infrastructures `I = Σ w_k × n_k`. Vaut 0 tant que BPE et OSM ne sont pas importés. */
export function scoreInfra(comptes: ComptesInfra): number {
  return equipementsRetenus(comptes).reduce((total, e) => total + POIDS_INFRA[e.category] * e.count, 0);
}

export const VALEUR_BASE = {
  fixe: 3_000,
  coefPopulation: 30,
  expPopulation: 0.9,
  coefInfra: 1_200,
  expInfra: 0.8,
} as const;

const arrondi = (x: number, pas: number) => Math.round(x / pas) * pas;
const borne = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** V0 = arrondi_100( 3 000 + 30 × P^0,9 + 1 200 × I^0,8 ) : prix d'achat d'une commune libre. */
export function valeurBase(population: number, infra: number): number {
  const { fixe, coefPopulation, expPopulation, coefInfra, expInfra } = VALEUR_BASE;
  const p = Math.max(0, population);
  const i = Math.max(0, infra);
  return arrondi(fixe + coefPopulation * p ** expPopulation + coefInfra * i ** expInfra, 100);
}

/** f_T = borne( √(V0 / 10 000) ; 1 ; 60 ) : multiplie coût et revenu des bâtiments. */
export function facteurTaille(v0: number): number {
  return borne(Math.sqrt(v0 / 10_000), 1, 60);
}

export const EMPLACEMENTS_MIN = 3;
export const EMPLACEMENTS_MAX = 16;

/** Emplacements = borne( 2 + ⌊2 × log10(1 + P)⌋ ; 3 ; 16 ). */
export function emplacements(population: number): number {
  const p = Math.max(0, population);
  return borne(2 + Math.floor(2 * Math.log10(1 + p)), EMPLACEMENTS_MIN, EMPLACEMENTS_MAX);
}

// --- Étape 2 : inscription, revenu du sol, valeur d'un territoire ---

/** Cash versé à l'inscription (`signup_bonus`) : de quoi acheter un village le premier jour (5.1, 5.9). */
export const CAPITAL_DEPART = 30_000;

/** Protection débutant : pas d'OPA sur un nouveau joueur pendant 72 h (5.5). */
export const PROTECTION_DEBUTANT_S = 72 * 3_600;

/** Part de V0 rapportée chaque heure par le sol d'un territoire (5.3). */
export const TAUX_REVENU_SOL = 0.01;

/** R_sol = arrondi( 1 % × V0 ) par heure. */
export function revenuSol(v0: number): number {
  return Math.round(TAUX_REVENU_SOL * v0);
}

/** V_T = V0 + B + F : B = cash investi dans les bâtiments, F = fortifications (5.4). */
export function valeurTerritoire(v0: number, investi: number, fortifications: number): number {
  return v0 + investi + fortifications;
}

// --- Étape 3 : bâtiments (5.2) ---
// Les paramètres propres à chaque bâtiment (coût, revenu, durée, croissances…) sont dans la table
// `building_types` ; les formules ci-dessous les reçoivent tels quels.

/** Tous les bâtiments s'arrêtent au niveau 5 (décision du début de l'étape 3). */
export const NIVEAU_MAX_BATIMENT = 5;

/** Durée du tout premier chantier, pendant le tutoriel. */
export const DUREE_CHANTIER_TUTORIEL_S = 10;

/** Part de `invested_cash` rendue quand on démolit un bâtiment. */
export const TAUX_REMBOURSEMENT_DEMOLITION = 0.3;

/** Paramètres d'un type de bâtiment utiles aux formules (colonnes de `building_types`). */
export interface ParametresBatiment {
  /** Coût du niveau 1, avant facteur de taille (`base_cost`). */
  baseCost: number;
  /** Multiplicateur du coût à chaque niveau (`cost_growth`). */
  costGrowth: number;
  /** Revenu du niveau 1 par heure, avant facteur de taille (`base_income_per_hour`). */
  baseIncomePerHour: number;
  /** Multiplicateur du revenu à chaque niveau (`income_growth`). */
  incomeGrowth: number;
  /** Bonus de revenu sur tout le territoire, en % par niveau (`income_bonus_pct`). */
  incomeBonusPct: number;
  /** Durée du chantier du niveau 1, en secondes (`base_build_seconds`). */
  baseBuildSeconds: number;
  /** Multiplicateur de la durée à chaque niveau (`time_growth`). */
  timeGrowth: number;
  /** Faux pour le siège social : son coût ne dépend pas de la taille de la commune (`scales_with_territory`). */
  scalesWithTerritory: boolean;
}

function verifierNiveau(niveau: number, min: number): void {
  if (!Number.isInteger(niveau) || niveau < min || niveau > NIVEAU_MAX_BATIMENT) {
    throw new RangeError(`niveau de bâtiment attendu entre ${min} et ${NIVEAU_MAX_BATIMENT}, reçu ${niveau}`);
  }
}

/** C(L) = arrondi_10( C_base × f_T × croissance^(L−1) ) ; sans f_T pour le siège social. */
export function coutNiveau(type: ParametresBatiment, niveau: number, fT: number): number {
  verifierNiveau(niveau, 1);
  const taille = type.scalesWithTerritory ? fT : 1;
  return arrondi(type.baseCost * taille * type.costGrowth ** (niveau - 1), 10);
}

/** Les seuls paramètres d'un type de bâtiment qui jouent sur le revenu. */
export type ParametresRevenu = Pick<
  ParametresBatiment,
  'baseIncomePerHour' | 'incomeGrowth' | 'incomeBonusPct' | 'scalesWithTerritory'
>;

/** R(L) = arrondi( R_base × f_T × croissance^(L−1) ) par heure ; 0 au niveau 0 (première construction en cours). */
export function revenuNiveau(type: ParametresRevenu, niveau: number, fT: number): number {
  verifierNiveau(niveau, 0);
  if (niveau === 0) return 0;
  const taille = type.scalesWithTerritory ? fT : 1;
  return Math.round(type.baseIncomePerHour * taille * type.incomeGrowth ** (niveau - 1));
}

/** Bonus de revenu du bâtiment sur tout le territoire, en % : bonus par niveau × L. */
export function bonusNiveau(type: ParametresRevenu, niveau: number): number {
  verifierNiveau(niveau, 0);
  return type.incomeBonusPct * niveau;
}

/** T(L) = T_base × croissance^(L−1), en secondes entières. */
export function dureeChantier(type: ParametresBatiment, niveau: number): number {
  verifierNiveau(niveau, 1);
  return Math.round(type.baseBuildSeconds * type.timeGrowth ** (niveau - 1));
}

/** Démolition : rend 30 % du cash investi, arrondi à l'unité inférieure. */
export function remboursementDemolition(investi: number): number {
  return Math.floor(TAUX_REMBOURSEMENT_DEMOLITION * investi);
}

// --- Étape 3 : revenus (5.3) ---

/** Plafond des boosts de revenu (quête ou boutique), jamais cumulés au-delà. */
export const BOOST_MAX_PCT = 25;

/** Les revenus s'accumulent au plus 48 h d'absence ; au-delà, ils attendent le retour du joueur. */
export const PLAFOND_HORS_LIGNE_S = 48 * 3_600;

/** Ce qu'un bâtiment apporte à son territoire. */
export interface ApportBatiment {
  revenuParHeure: number;
  bonusPct: number;
}

/** Ce qu'un bâtiment de ce niveau apporte à son territoire : son revenu et son bonus. */
export function apportBatiment(type: ParametresRevenu, niveau: number, fT: number): ApportBatiment {
  return { revenuParHeure: revenuNiveau(type, niveau, fT), bonusPct: bonusNiveau(type, niveau) };
}

/** R_T = arrondi( ( R_sol + Σ R_b ) × ( 1 + Σ bonus_b / 100 ) ) par heure. */
export function revenuTerritoire(v0: number, batiments: readonly ApportBatiment[]): number {
  const revenus = batiments.reduce((total, b) => total + b.revenuParHeure, revenuSol(v0));
  const bonus = batiments.reduce((total, b) => total + b.bonusPct, 0);
  return Math.round(revenus * (1 + bonus / 100));
}

/** R_J = arrondi( Σ R_T × ( 1 + boost ) ), boost plafonné à 25 %. */
export function revenuJoueur(revenusTerritoires: readonly number[], boostPct = 0): number {
  const total = revenusTerritoires.reduce((somme, r) => somme + r, 0);
  const boost = borne(boostPct, 0, BOOST_MAX_PCT);
  return Math.round(total * (1 + boost / 100));
}

/** À partir de l'instant `a` (secondes Unix), le joueur gagne `revenuParHeure`. */
export interface ChangementRevenu {
  a: number;
  revenuParHeure: number;
}

/**
 * Revenu accumulé depuis `depuis` (dernier encaissement), calculé par morceaux (5.3), en ₮ × secondes :
 * Σ R × Δt, un entier. Le revenu change à chaque chantier fini pendant l'absence. Seules les 48 premières
 * heures comptent. `changements` : les nouveaux revenus, dans n'importe quel ordre. Un changement daté de
 * `depuis` ou avant remplace `revenuDepart` (le plus récent gagne) ; ceux d'après la fenêtre des 48 h sont ignorés.
 */
export function revenuCumule(
  depuis: number,
  maintenant: number,
  revenuDepart: number,
  changements: readonly ChangementRevenu[] = [],
): number {
  const fin = Math.min(maintenant, depuis + PLAFOND_HORS_LIGNE_S);
  if (fin <= depuis) return 0;
  const tries = [...changements].sort((x, y) => x.a - y.a);
  let total = 0;
  let debut = depuis;
  let revenu = revenuDepart;
  for (const { a, revenuParHeure } of tries) {
    if (a >= fin) break;
    if (a > debut) {
      total += revenu * (a - debut);
      debut = a;
    }
    revenu = revenuParHeure;
  }
  return total + revenu * (fin - debut);
}

/** Gain en ₮ : ⌊ Σ R × Δt / 3 600 ⌋ (une seule troncature à la fin, pour ne perdre aucune fraction en route). */
export function gainParMorceaux(
  depuis: number,
  maintenant: number,
  revenuDepart: number,
  changements: readonly ChangementRevenu[] = [],
): number {
  return Math.floor(revenuCumule(depuis, maintenant, revenuDepart, changements) / 3_600);
}

/**
 * Encaissement : `cumul` (₮ × s, voir `revenuCumule`) plus le `reste` gardé la dernière fois.
 * Les fractions de ₮ ne sont jamais perdues : elles restent (0 à 3 599) pour le prochain encaissement.
 */
export function partagerCumul(cumul: number, reste: number): { gain: number; reste: number } {
  const total = cumul + reste;
  return { gain: Math.floor(total / 3_600), reste: total % 3_600 };
}

// --- Étape 3 : achat, vente, limites (5.4) ---

/** Bouclier anti-OPA posé sur une commune qu'on vient d'acheter. */
export const BOUCLIER_ACHAT_S = 12 * 3_600;

/** Part de V_T versée par l'État quand on lui revend une commune (ses bâtiments sont détruits). */
export const TAUX_VENTE_ETAT = 0.7;

/** Prix d'achat d'une commune libre : arrondi_100( V0 × réglage des prix en % ) ; un prix forcé par un admin passe avant. */
export function prixAchat(v0: number, pctPrix: number, prixForce: number | null = null): number {
  return prixForce ?? ajuster(v0, pctPrix, 100);
}

/** Vente à l'État : arrondi_100_inférieur( 70 % × V_T ). */
export function prixVenteEtat(valeurTotale: number): number {
  return Math.floor((TAUX_VENTE_ETAT * valeurTotale) / 100) * 100;
}

/** Territoires possédables au départ (4 depuis que le siège social s'arrête au niveau 5). */
export const TERRITOIRES_DEPART = 4;

/** Plafond absolu de territoires par joueur (colonne `users.max_territories`). */
export const TERRITOIRES_MAX = 12;

/** Files de construction au départ : une seule (une 2ᵉ s'achètera plus tard, avec la boutique). */
export const FILES_CONSTRUCTION_DEPART = 1;

/** On ne peut déplacer sa capitale (le siège social) qu'une fois tous les 7 jours. */
export const DELAI_DEPLACEMENT_CAPITALE_S = 7 * 24 * 3_600;

/** Rangs selon le patrimoine (5.4) ; `bonusTerritoires` s'ajoute à la limite de territoires. */
export const RANGS = [
  { niveau: 0, nom: 'Entrepreneur', patrimoineMin: 0, bonusTerritoires: 0 },
  { niveau: 1, nom: 'Notable', patrimoineMin: 250_000, bonusTerritoires: 0 },
  { niveau: 2, nom: 'Baron', patrimoineMin: 2_500_000, bonusTerritoires: 1 },
  { niveau: 3, nom: 'Magnat', patrimoineMin: 25_000_000, bonusTerritoires: 1 },
  { niveau: 4, nom: 'Tycoon', patrimoineMin: 250_000_000, bonusTerritoires: 0 },
] as const;

/** Bonus de territoires cumulé jusqu'au rang donné : +1 au rang Baron, +1 au rang Magnat. */
export function bonusTerritoiresRang(rang: number): number {
  return RANGS.filter((r) => r.niveau <= rang).reduce((total, r) => total + r.bonusTerritoires, 0);
}

/** max_territories = min( 12 ; 4 + niveau du siège + bonus de rang + emplacement acheté ). */
export function maxTerritoires(niveauSiege: number, rang: number, emplacementAchete: number): number {
  return Math.min(TERRITOIRES_MAX, TERRITOIRES_DEPART + niveauSiege + bonusTerritoiresRang(rang) + emplacementAchete);
}

// --- Étape 4 : patrimoine (5.4) ---

/** NW = cash + Σ V_T + séquestres d'OPA en cours (les gemmes ne comptent pas). */
export function patrimoine(cash: number, valeursTerritoires: readonly number[], sequestres: readonly number[]): number {
  const somme = (valeurs: readonly number[]) => valeurs.reduce((total, v) => total + v, 0);
  return cash + somme(valeursTerritoires) + somme(sequestres);
}

// --- Étape 4 : OPA (5.5) ---
// Les taux sont en % entiers : le calcul se fait en entiers, sans nombre à virgule.

/** `x × pct %`, arrondi à la centaine supérieure. */
const plafond100Pct = (x: number, pct: number) => Math.ceil((x * pct) / 10_000) * 100;

/** Offre de l'attaquant, en % de V_T : bloquée chez lui (séquestre) pendant l'OPA. */
export const TAUX_OFFRE_OPA_PCT = 150;
/** Coût de la défense, en % de V_T : payé par le défenseur pour garder sa commune. */
export const TAUX_DEFENSE_OPA_PCT = 35;
/** Indemnité d'échec, en % de l'offre : versée au défenseur si l'OPA est défendue ou retirée. */
export const TAUX_INDEMNITE_OPA_PCT = 5;

/** Les trois montants d'une OPA, figés au lancement. */
export interface MontantsOpa {
  offre: number;
  defense: number;
  indemnite: number;
}

/** P_OPA = plafond_100( 1,5 × V_T ) ; D = plafond_100( 0,35 × V_T ) ; i = plafond_100( 5 % × P_OPA ). */
export function montantsOpa(valeurTerritoire: number): MontantsOpa {
  const offre = plafond100Pct(valeurTerritoire, TAUX_OFFRE_OPA_PCT);
  return {
    offre,
    defense: plafond100Pct(valeurTerritoire, TAUX_DEFENSE_OPA_PCT),
    indemnite: plafond100Pct(offre, TAUX_INDEMNITE_OPA_PCT),
  };
}

/** Le défenseur a 24 h pour réagir ; sans réponse, l'OPA réussit. */
export const DELAI_REPONSE_OPA_S = 24 * 3_600;

/** Bouclier posé sur la commune après une défense réussie. */
export const BOUCLIER_DEFENSE_S = 72 * 3_600;

/** Bouclier posé sur la commune prise par une OPA (acceptée ou expirée). */
export const BOUCLIER_OPA_REUSSIE_S = 48 * 3_600;

/** Ancienneté du compte pour lancer une OPA (contre les faux comptes ; gardée à 7 jours au début de l'étape 4). */
export const ANCIENNETE_ATTAQUANT_S = 7 * 24 * 3_600;

/** Rang à partir duquel on peut mener 2 OPA en même temps (Magnat). */
export const RANG_DEUX_OPA = 3;

/** OPA qu'un joueur peut mener en même temps : 1, ou 2 à partir du rang Magnat. */
export function opaSortantesMax(rang: number): number {
  return rang >= RANG_DEUX_OPA ? 2 : 1;
}

/** Un défenseur ne subit pas plus de 2 OPA en même temps. */
export const OPA_RECUES_MAX = 2;

/** Même attaquant → même défenseur : 7 jours d'attente après un échec (OPA défendue ou retirée). */
export const DELAI_APRES_ECHEC_OPA_S = 7 * 24 * 3_600;

/** Anti-acharnement : on ne vise pas un joueur dont le patrimoine est sous 25 % du sien. */
export const PATRIMOINE_CIBLE_MIN_PCT = 25;

/** Vrai si la cible est trop petite pour l'attaquant : NW_cible < 25 % × NW_attaquant. */
export function cibleTropPetite(patrimoineCible: number, patrimoineAttaquant: number): boolean {
  return patrimoineCible * 100 < patrimoineAttaquant * PATRIMOINE_CIBLE_MIN_PCT;
}

// --- Étape 4 : inactivité (5.6) ---

/** Activité = toute requête connectée ; `last_active_at` est mis à jour au plus toutes les 5 min. */
export const ACTIVITE_MAJ_S = 5 * 60;

/** J+11 sans activité : message « tes territoires seront libérés dans 3 jours ». */
export const AVERTISSEMENT_INACTIVITE_S = 11 * 24 * 3_600;

/** J+14 sans activité : les territoires sont rachetés par l'État et redeviennent libres. */
export const LIBERATION_INACTIVITE_S = 14 * 24 * 3_600;

/** Part de V0 + B versée au joueur inactif quand l'État rachète un territoire. */
export const TAUX_RACHAT_INACTIVITE_PCT = 50;

/** Rachat pour inactivité : arrondi_100_inférieur( 50 % × (V0 + B) ) ; les fortifications ne comptent pas. */
export function rachatInactivite(v0: number, investi: number): number {
  return Math.floor(((v0 + investi) * TAUX_RACHAT_INACTIVITE_PCT) / 10_000) * 100;
}

// --- Étape 5 : rangs (5.4) ---

/** Rang atteint avec ce patrimoine : le plus haut dont le seuil est atteint. */
export function rangDuPatrimoine(patrimoineJoueur: number): number {
  return RANGS.reduce((rang, r) => (patrimoineJoueur >= r.patrimoineMin ? r.niveau : rang), 0);
}

/**
 * Le rang ne redescend jamais (décidé au début de l'étape 5) : sinon un joueur perdrait un emplacement
 * et se retrouverait au-dessus de sa limite de territoires après une OPA perdue.
 */
export function nouveauRang(rangActuel: number, patrimoineJoueur: number): number {
  return Math.max(rangActuel, rangDuPatrimoine(patrimoineJoueur));
}

/** La tâche `leaderboard` recalcule patrimoines et rangs toutes les 10 min (docs/02, 2.6). */
export const CLASSEMENT_TOUTES_LES_S = 10 * 60;

// --- Étape 5 : quêtes du jour (5.7) ---

/** Les quêtes se renouvellent à minuit, heure de Paris (heure d'été comprise). */
export const FUSEAU_JEU = 'Europe/Paris';

const formatJour = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_JEU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Date et heure affichées à Paris pour un instant (secondes Unix). */
function heureDeParis(instant: number) {
  const parties = Object.fromEntries(
    formatJour.formatToParts(new Date(instant * 1000)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    annee: Number(parties.year),
    mois: Number(parties.month),
    jour: Number(parties.day),
    secondes: Number(parties.hour) * 3_600 + Number(parties.minute) * 60 + Number(parties.second),
  };
}

/** Jour du jeu `AAAA-MM-JJ` à Paris (colonne `user_quests.quest_date`). */
export function jourParis(instant: number): string {
  const { annee, mois, jour } = heureDeParis(instant);
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** Décalage de Paris sur UTC à cet instant, en secondes (3 600 en hiver, 7 200 en été). */
function decalageParis(instant: number): number {
  const { annee, mois, jour, secondes } = heureDeParis(instant);
  return Date.UTC(annee, mois - 1, jour) / 1000 + secondes - instant;
}

/** Prochain minuit à Paris (secondes Unix) : les quêtes du jour changent à cet instant. */
export function prochainMinuitParis(instant: number): number {
  const { annee, mois, jour } = heureDeParis(instant);
  // Minuit du lendemain « comme si Paris était à l'heure UTC », moins le décalage de ce soir-là.
  // Le changement d'heure se fait à 2 h ou 3 h du matin, jamais entre 21 h UTC et minuit à Paris.
  const minuitUtc = Date.UTC(annee, mois - 1, jour + 1) / 1000;
  return minuitUtc - decalageParis(minuitUtc - 3 * 3_600);
}

/** Récompense d'une quête : max( cash_min ; arrondi_100( h × R_J ) ), figée au tirage (h = 1 à 4 heures). */
export function recompenseQuete(heures: number, revenuHeure: number, cashMin: number): number {
  return Math.max(cashMin, Math.round((heures * revenuHeure) / 100) * 100);
}

// --- Réglages à chaud (dashboard /admin, étape 6) ---

/** Un réglage en % : 100 = normal. Un admin règle chaque valeur entre ÷ 4 et × 4. */
export const REGLAGE_PCT_MIN = 25;
export const REGLAGE_PCT_MAX = 400;

/** Le réglage qui s'applique (base × événements en cours) reste entre ÷ 10 et × 10, même si des événements se cumulent. */
export const REGLAGE_EFFECTIF_MIN = 10;
export const REGLAGE_EFFECTIF_MAX = 1_000;

/** Un événement dure au plus 30 jours et commence au plus tard dans 90 jours. */
export const EVENEMENT_DUREE_MAX_H = 30 * 24;
export const EVENEMENT_DEBUT_MAX_S = 90 * 24 * 3_600;

/** Les trois réglages, en % : prix d'achat d'une commune libre, revenus passifs, coût des bâtiments. */
export interface Reglages {
  price: number;
  income: number;
  building: number;
}
export const REGLAGES_NORMAUX: Readonly<Reglages> = { price: 100, income: 100, building: 100 };

/** Réglage effectif : base × chaque événement en cours, arrondi au %, borné entre ÷ 10 et × 10. */
export function combinerPct(base: number, evenements: readonly number[]): number {
  const pct = evenements.reduce((total, e) => (total * e) / 100, base);
  return borne(Math.round(pct), REGLAGE_EFFECTIF_MIN, REGLAGE_EFFECTIF_MAX);
}

/** montant × pct / 100, arrondi au pas, jamais sous le pas : à 100 %, un montant déjà au pas ne change pas. */
export function ajuster(montant: number, pct: number, pas = 1): number {
  if (montant <= 0) return montant;
  return Math.max(pas, arrondi((montant * pct) / 100, pas));
}
