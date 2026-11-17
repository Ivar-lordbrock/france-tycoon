import { describe, expect, it } from 'vitest';
import { estZoneCode, NOMS_ZONES, typeDeRegion, ZONE_CODES, zoneDuDepartement } from './zones.ts';

describe('zones', () => {
  it('compte exactement 12 zones, toutes nommées', () => {
    expect(ZONE_CODES).toHaveLength(12);
    for (const code of ZONE_CODES) expect(NOMS_ZONES[code]).toBeTruthy();
  });

  it.each([
    ['01', 'MET'],
    ['2A', 'MET'],
    ['2B', 'MET'],
    ['95', 'MET'],
    ['971', 'GP'],
    ['972', 'MQ'],
    ['973', 'GF'],
    ['974', 'RE'],
    ['976', 'YT'],
    ['975', 'PM'],
    ['977', 'BL'],
    ['978', 'MF'],
    ['986', 'WF'],
    ['987', 'PF'],
    ['988', 'NC'],
  ])('le département %s est dans la zone %s', (departement, zone) => {
    expect(zoneDuDepartement(departement)).toBe(zone);
  });

  it.each(['984', '989', '20', '96', '00', '99', 'XX'])('refuse le code %s (TAAF, Clipperton ou inconnu)', (code) => {
    expect(zoneDuDepartement(code)).toBeNull();
  });

  it("classe l'Outre-mer à part", () => {
    expect(typeDeRegion('74')).toBe('metropole');
    expect(typeDeRegion('2A')).toBe('metropole');
    expect(typeDeRegion('987')).toBe('outre_mer');
  });

  it('reconnaît un code de zone', () => {
    expect(estZoneCode('MQ')).toBe(true);
    expect(estZoneCode('ES')).toBe(false);
  });
});
