// Les 12 zones françaises du jeu (colonne `territories.zone_code`).
// TAAF (984) et Clipperton (989) sont exclus en V1.

export const ZONE_CODES = ['MET', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'WF', 'PF', 'NC'] as const;

export type ZoneCode = (typeof ZONE_CODES)[number];

export const NOMS_ZONES: Record<ZoneCode, string> = {
  MET: 'Métropole',
  GP: 'Guadeloupe',
  MQ: 'Martinique',
  GF: 'Guyane',
  RE: 'La Réunion',
  YT: 'Mayotte',
  PM: 'Saint-Pierre-et-Miquelon',
  BL: 'Saint-Barthélemy',
  MF: 'Saint-Martin',
  WF: 'Wallis-et-Futuna',
  PF: 'Polynésie française',
  NC: 'Nouvelle-Calédonie',
};

/** Code « département » de chaque zone d'Outre-mer (DROM et COM). */
const ZONE_PAR_DEPARTEMENT: Record<string, ZoneCode> = {
  '971': 'GP',
  '972': 'MQ',
  '973': 'GF',
  '974': 'RE',
  '975': 'PM',
  '976': 'YT',
  '977': 'BL',
  '978': 'MF',
  '986': 'WF',
  '987': 'PF',
  '988': 'NC',
};

/** Collectivités d'outre-mer absentes de `/departements` de l'API Geo, importées à part. */
export const COLLECTIVITES_OUTRE_MER: ReadonlyArray<{ code: string; nom: string }> = [
  { code: '975', nom: 'Saint-Pierre-et-Miquelon' },
  { code: '977', nom: 'Saint-Barthélemy' },
  { code: '978', nom: 'Saint-Martin' },
  { code: '986', nom: 'Wallis-et-Futuna' },
  { code: '987', nom: 'Polynésie française' },
  { code: '988', nom: 'Nouvelle-Calédonie' },
];

const DEPARTEMENTS_EXCLUS = new Set(['984', '989']);

/**
 * Zone d'un code département ('01'..'95', '2A', '2B', '971'..'988').
 * Renvoie `null` pour un code exclu (TAAF, Clipperton) ou inconnu.
 */
export function zoneDuDepartement(code: string): ZoneCode | null {
  if (DEPARTEMENTS_EXCLUS.has(code)) return null;
  const outreMer = ZONE_PAR_DEPARTEMENT[code];
  if (outreMer) return outreMer;
  // 01 à 95 sauf 20 (remplacé par 2A et 2B en 1976)
  return /^(0[1-9]|1\d|2[1-9AB]|[3-8]\d|9[0-5])$/.test(code) ? 'MET' : null;
}

/** `outre_mer` pour les codes à trois chiffres (97x, 98x), `metropole` sinon. */
export function typeDeRegion(code: string): 'metropole' | 'outre_mer' {
  return code.length === 3 ? 'outre_mer' : 'metropole';
}

export function estZoneCode(valeur: string): valeur is ZoneCode {
  return (ZONE_CODES as readonly string[]).includes(valeur);
}
