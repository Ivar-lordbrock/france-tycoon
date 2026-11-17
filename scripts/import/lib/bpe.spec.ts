import { describe, expect, it } from 'vitest';
import { categorieBpe, communeDeLIris, compterBpe } from './bpe.ts';

describe('BPE : catégories et communes', () => {
  it('range chaque type d’équipement dans une catégorie du jeu', () => {
    expect(categorieBpe('A', 'A101')).toBe('service');
    expect(categorieBpe('A', 'A504')).toBe('restaurant');
    expect(categorieBpe('B', 'B104')).toBe('commerce');
    expect(categorieBpe('C', 'C101')).toBe('education');
    expect(categorieBpe('D', 'D201')).toBe('sante');
    expect(categorieBpe('F', 'F101')).toBe('sport_loisir');
    expect(categorieBpe('G', 'G102')).toBe('hotel');
    expect(categorieBpe('G', 'G103')).toBe('hotel');
    expect(categorieBpe('G', 'G104')).toBe('service');
    expect(categorieBpe('E', 'E107')).toBeNull(); // gares : toujours OSM
  });

  it('regroupe les arrondissements de Paris, Lyon et Marseille', () => {
    expect(communeDeLIris('751010101')).toBe('75056');
    expect(communeDeLIris('693810101')).toBe('69123');
    expect(communeDeLIris('132150101')).toBe('13055');
    expect(communeDeLIris('2A0040000')).toBe('2A004');
    expect(communeDeLIris('971200101')).toBe('97120');
  });
});

describe('compterBpe', () => {
  it('additionne par commune et catégorie, ignore le domaine E et les lignes vides', () => {
    const csv = [
      'TIME_PERIOD;GEO_OBJECT;GEO;FACILITY_DOM;FACILITY_SDOM;FACILITY_TYPE;BPE_MEASURE;OBS_VALUE',
      '2025;IRIS;010010000;A;A1;A129;FACILITIES;1',
      '2025;IRIS;010010000;A;A5;A504;FACILITIES;2',
      '2025;IRIS;010010000;E;E1;E107;FACILITIES;1',
      '2025;IRIS;751010101;B;B1;B104;FACILITIES;3',
      '2025;IRIS;751200202;B;B1;B104;FACILITIES;4',
      '2025;IRIS;751200202;G;G1;G102;FACILITIES;5',
      '',
    ].join('\r\n');

    expect(Object.fromEntries(compterBpe(csv))).toEqual({
      '01001': { service: 1, restaurant: 2 },
      '75056': { commerce: 7, hotel: 5 },
    });
  });

  it('signale un fichier qui n’a pas les colonnes attendues', () => {
    expect(() => compterBpe('a;b;c\n1;2;3')).toThrow(/Colonne GEO absente/);
  });
});
