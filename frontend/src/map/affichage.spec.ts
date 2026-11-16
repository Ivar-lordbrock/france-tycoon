import type { CommuneCarte, EtatTerritoire } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { type Affiche, communesVoulues, planifier } from './affichage.ts';

const commune = (insee: string, state: EtatTerritoire = 'free'): CommuneCarte => ({
  type: 'Feature',
  id: insee,
  properties: { insee, name: `Commune ${insee}`, state, ownerColor: null, ownerPseudo: null },
  geometry: { type: 'Polygon', coordinates: [] },
});

const affichees = (...lignes: [string, Affiche['detail'], EtatTerritoire?][]) =>
  new Map(lignes.map(([insee, detail, etat]) => [insee, { detail, commune: commune(insee, etat) }]));

describe('affichage des communes', () => {
  it('dédoublonne les communes à cheval sur deux cases', () => {
    const voulues = communesVoulues([
      { detail: 'low', communes: [commune('42218'), commune('42207')] },
      { detail: 'low', communes: [commune('42207'), commune('43157')] },
    ]);
    expect([...voulues.keys()]).toEqual(['42218', '42207', '43157']);
  });

  it('ajoute les nouvelles et retire celles qui sortent de la vue', () => {
    const voulues = communesVoulues([{ detail: 'low', communes: [commune('42218'), commune('43157')] }]);
    const plan = planifier(affichees(['42218', 'low'], ['01001', 'low']), voulues, true);
    expect(plan.ajouter.map((v) => v.commune.id)).toEqual(['43157']);
    expect(plan.retirer).toEqual(['01001']);
  });

  it('ne retire rien tant qu’une case charge encore', () => {
    const voulues = communesVoulues([{ detail: 'high', communes: [commune('42218')] }]);
    const plan = planifier(affichees(['42218', 'low'], ['01001', 'low']), voulues, false);
    expect(plan.retirer).toEqual(['42218']); // remplacée par son contour précis
    expect(plan.ajouter.map((v) => `${v.commune.id}:${v.detail}`)).toEqual(['42218:high']);
  });

  it('redessine une commune dont l’état change', () => {
    const voulues = communesVoulues([{ detail: 'low', communes: [commune('42218', 'rival')] }]);
    expect(planifier(affichees(['42218', 'low', 'free']), voulues, true)).toMatchObject({ retirer: ['42218'] });
    expect(planifier(affichees(['42218', 'low', 'rival']), voulues, true)).toEqual({ ajouter: [], retirer: [] });
  });
});
