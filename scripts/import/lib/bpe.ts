import type { CategorieInfra } from '@france-tycoon/shared';

/** Comptes d'équipements par commune (code INSEE), seulement les catégories non nulles. */
export type ComptesParCommune = Map<string, Partial<Record<CategorieInfra, number>>>;

/**
 * Catégorie du jeu pour un type d'équipement de la BPE (nomenclature INSEE 2025).
 * Domaine E (transports) ignoré : gares et aéroports viennent toujours d'OpenStreetMap.
 */
export function categorieBpe(domaine: string, type: string): CategorieInfra | null {
  switch (domaine) {
    case 'A':
      return type === 'A504' ? 'restaurant' : 'service'; // A504 : restaurants, restauration rapide
    case 'B':
      return 'commerce';
    case 'C':
      return 'education';
    case 'D':
      return 'sante';
    case 'F':
      return 'sport_loisir';
    case 'G': // tourisme : hôtel, camping, auberge de jeunesse ; agences et offices de tourisme = service
      return type === 'G102' || type === 'G103' || type === 'G105' ? 'hotel' : 'service';
    default:
      return null;
  }
}

/** Paris, Lyon et Marseille : la BPE compte par arrondissement, le jeu par commune. */
export function communeDeLIris(iris: string): string {
  const code = iris.slice(0, 5);
  if (code.startsWith('751')) return '75056';
  if (code.startsWith('6938')) return '69123';
  if (code.startsWith('132')) return '13055';
  return code;
}

/**
 * Lit le CSV « BPE par IRIS » de l'INSEE (séparateur `;`, une ligne par IRIS et type d'équipement)
 * et additionne les équipements par commune et catégorie.
 */
export function compterBpe(csv: string): ComptesParCommune {
  const lignes = csv.split(/\r?\n/);
  const entete = (lignes[0] ?? '').split(';');
  const col = (nom: string) => {
    const i = entete.indexOf(nom);
    if (i < 0) throw new Error(`Colonne ${nom} absente du fichier BPE`);
    return i;
  };
  const [cGeo, cDomaine, cType, cValeur] = [col('GEO'), col('FACILITY_DOM'), col('FACILITY_TYPE'), col('OBS_VALUE')];
  const iObjet = entete.indexOf('GEO_OBJECT');

  const comptes: ComptesParCommune = new Map();
  for (let n = 1; n < lignes.length; n++) {
    const ligne = lignes[n];
    if (!ligne) continue;
    const champs = ligne.split(';');
    if (iObjet >= 0 && champs[iObjet] !== 'IRIS') continue;
    const categorie = categorieBpe(champs[cDomaine] ?? '', champs[cType] ?? '');
    const nombre = Number(champs[cValeur]);
    if (!categorie || !Number.isInteger(nombre) || nombre <= 0) continue;
    const insee = communeDeLIris(champs[cGeo] ?? '');
    const commune = comptes.get(insee) ?? {};
    commune[categorie] = (commune[categorie] ?? 0) + nombre;
    comptes.set(insee, commune);
  }
  return comptes;
}
