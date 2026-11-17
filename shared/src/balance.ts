// Constantes et formules d'équilibrage : seul endroit où elles vivent (avec la table `building_types`).
// Toute modification ici se reporte dans docs/05-equilibrage.md.
// Étape 1 : section 5.1 (valeur d'une commune), utilisée par scripts/import/communes.
// Étape 2 : capital de départ, protection débutant, revenu du sol (5.3), valeur d'un territoire (5.4).
// Le reste (bâtiments, revenus des bâtiments, OPA) arrive à l'étape 3.

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
