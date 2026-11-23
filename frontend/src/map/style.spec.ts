import type { ProprietesCommuneCarte } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { bulleCommune, COULEURS, clair, styleCommune } from './style.ts';

const proprietes = (p: Partial<ProprietesCommuneCarte> = {}): ProprietesCommuneCarte => ({
  insee: '42218',
  name: 'Saint-Étienne',
  state: 'free',
  ownerColor: null,
  ownerPseudo: null,
  ...p,
});

describe('style des communes', () => {
  it('laisse une commune libre transparente, avec un trait fin', () => {
    expect(styleCommune(proprietes())).toMatchObject({ color: COULEURS.encre, weight: 0.8, fillOpacity: 0 });
  });

  it('éclaircit la couleur du joueur pour le fond sombre', () => {
    expect(clair('#dc2626')).toBe('#e87272');
    expect(clair('#000000')).toBe('#595959');
  });

  it('colore une commune possédée avec la couleur du joueur', () => {
    expect(styleCommune(proprietes({ state: 'rival', ownerColor: '#dc2626' }))).toMatchObject({
      color: '#e87272',
      fillColor: '#e87272',
      fillOpacity: 0.22,
    });
  });

  it('trace mes communes d’un contour épais, pour les distinguer d’un rival de couleur proche', () => {
    expect(styleCommune(proprietes({ state: 'mine', ownerColor: '#dc2626' }))).toMatchObject({
      color: '#e87272',
      weight: 3,
    });
  });

  it('distingue bouclier et OPA par un trait en tirets', () => {
    expect(styleCommune(proprietes({ state: 'shield', ownerColor: '#dc2626' }))).toMatchObject({
      color: COULEURS.bouclier,
      dashArray: '4 3',
    });
    expect(styleCommune(proprietes({ state: 'takeover' }))).toMatchObject({ color: COULEURS.opa, dashArray: '6 4' });
  });

  it('éclaire la commune survolée et cerne de jaune la commune choisie, sans cacher la couleur du joueur', () => {
    expect(styleCommune(proprietes(), { survolee: true })).toMatchObject({
      fillColor: COULEURS.encre,
      fillOpacity: 0.15,
    });
    expect(styleCommune(proprietes({ state: 'rival', ownerColor: '#dc2626' }), { selectionnee: true })).toMatchObject({
      color: COULEURS.surligneur,
      weight: 3,
      dashArray: undefined,
      fillColor: '#e87272',
    });
  });
});

describe('bulle des communes', () => {
  it('dit à qui est la commune', () => {
    expect(bulleCommune(proprietes())).toBe('Saint-Étienne · libre');
    expect(bulleCommune(proprietes({ state: 'mine', ownerPseudo: 'Moi' }))).toBe('Saint-Étienne · à toi');
    expect(bulleCommune(proprietes({ state: 'shield', ownerPseudo: 'Alice' }))).toBe(
      'Saint-Étienne · à Alice, sous bouclier',
    );
    expect(bulleCommune(proprietes({ state: 'takeover', ownerPseudo: 'Alice' }))).toBe('Saint-Étienne · OPA en cours');
  });
});
