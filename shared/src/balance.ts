// Constantes et formules d'équilibrage : seul endroit où elles vivent (avec la table `building_types`).
// Toute modification ici se reporte dans docs/05-equilibrage.md.
// Étape 1 : section 5.1 (valeur d'une commune), utilisée par scripts/import/communes.
// Le reste (bâtiments, revenus, OPA) arrive à l'étape 3.

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

/**
 * Score d'infrastructures `I = Σ w_k × n_k`.
 * `n_k` : BPE en priorité (Métropole, DROM), OSM sinon (COM) ; gares, aéroports, ports,
 * monuments et musées toujours depuis OSM. Vaut 0 tant que BPE et OSM ne sont pas importés.
 */
export function scoreInfra(comptes: ComptesInfra): number {
  let total = 0;
  for (const categorie of CATEGORIES_INFRA) {
    const source = comptes[categorie];
    if (!source) continue;
    const n = TOUJOURS_OSM.has(categorie) ? (source.osm ?? 0) : (source.bpe ?? source.osm ?? 0);
    total += POIDS_INFRA[categorie] * n;
  }
  return total;
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
