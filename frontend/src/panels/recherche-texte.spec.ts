import type { ResultatRecherche } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { descriptionResultat } from './recherche-texte.ts';

const resultat = (r: Partial<ResultatRecherche>): ResultatRecherche => ({
  insee: '42218',
  name: 'Saint-Étienne',
  department: '42',
  zone: 'MET',
  population: 173_089,
  center: { lat: 45.43, lng: 4.39 },
  bbox: [4.3, 45.4, 4.5, 45.5],
  ...r,
});

describe('description d’un résultat de recherche', () => {
  it('donne le département en Métropole', () => {
    expect(descriptionResultat(resultat({}))).toBe('Département 42, 173 089 habitants');
  });

  it('donne la zone en Outre-mer', () => {
    expect(descriptionResultat(resultat({ zone: 'MQ', department: '972', population: 76_000 }))).toBe(
      'Martinique, 76 000 habitants',
    );
  });

  it('accorde « habitant »', () => {
    expect(descriptionResultat(resultat({ population: 1 }))).toBe('Département 42, 1 habitant');
    expect(descriptionResultat(resultat({ population: 0 }))).toBe('Département 42, sans habitant');
  });
});
