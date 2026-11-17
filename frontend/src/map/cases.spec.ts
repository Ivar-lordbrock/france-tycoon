import { describe, expect, it } from 'vitest';
import { casesPourVue, detailPourZoom, MAX_CASES } from './cases.ts';

describe('cases de chargement des communes', () => {
  it('choisit le détail des contours selon le zoom', () => {
    expect(detailPourZoom(9)).toBe('low');
    expect(detailPourZoom(10)).toBe('low');
    expect(detailPourZoom(11)).toBe('high');
    expect(detailPourZoom(16)).toBe('high');
  });

  it('couvre la vue avec des cases de 1° au zoom 9', () => {
    const cases = casesPourVue([4.2, 45.3, 5.6, 45.9], 9);
    expect(cases.map((c) => c.cle)).toEqual(['low:4:45', 'low:5:45']);
    expect(cases[0]).toEqual({ cle: 'low:4:45', detail: 'low', bbox: [4, 45, 5, 46], zoom: 9 });
  });

  it('passe à des cases de 0,5° au zoom 11, avec un zoom serveur fixe', () => {
    const cases = casesPourVue([-61.1, 14.55, -60.95, 14.7], 12);
    expect(cases).toEqual([
      { cle: 'high:-123:29', detail: 'high', bbox: [-61.5, 14.5, -61, 15], zoom: 11 },
      {
        cle: 'high:-122:29',
        detail: 'high',
        bbox: [-61, 14.5, -60.5, 15],
        zoom: 11,
      },
    ]);
  });

  it('ne déborde pas d’une case quand la vue tombe pile sur une limite', () => {
    expect(casesPourVue([4, 45, 5, 46], 9).map((c) => c.cle)).toEqual(['low:4:45']);
  });

  it('garde les cases du centre sur un écran immense', () => {
    const cases = casesPourVue([-10, 40, 20, 52], 9);
    expect(cases).toHaveLength(MAX_CASES);
    expect(cases[0]?.bbox).toEqual([4, 45, 5, 46]);
  });
});
