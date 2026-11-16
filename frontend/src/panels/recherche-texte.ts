import { NOMS_ZONES, type ResultatRecherche } from '@france-tycoon/shared';

const nombre = new Intl.NumberFormat('fr-FR');

/** Deuxième ligne d'un résultat : où est la commune et combien d'habitants elle compte. */
export function descriptionResultat(r: ResultatRecherche): string {
  const lieu = r.zone === 'MET' ? `Département ${r.department}` : NOMS_ZONES[r.zone];
  const habitants =
    r.population === 0 ? 'sans habitant' : `${nombre.format(r.population)} habitant${r.population > 1 ? 's' : ''}`;
  return `${lieu}, ${habitants}`;
}
