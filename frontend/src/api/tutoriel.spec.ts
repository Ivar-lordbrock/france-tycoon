import type { EtapeTutoriel, MoiReponse, TutorielReponse } from '@france-tycoon/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { apresEtape, CLE_TUTORIEL, etapeEnCours } from './tutoriel.ts';

const etape = (position: number, completedAt: number | null) =>
  ({ key: `e${position}`, position, completedAt }) as EtapeTutoriel;
const tuto = (steps: EtapeTutoriel[], fini: Partial<TutorielReponse> = {}): TutorielReponse => ({
  steps,
  completedAt: null,
  skipped: false,
  ...fini,
});

describe('tutoriel', () => {
  it('montre la première étape pas faite, même si une suivante est déjà faite', () => {
    expect(etapeEnCours(tuto([etape(1, 10), etape(2, null), etape(3, 20)]))?.key).toBe('e2');
  });

  it('plus rien à montrer une fois fini, passé, ou pas encore lu', () => {
    expect(etapeEnCours(tuto([etape(1, null)], { skipped: true }))).toBeNull();
    expect(etapeEnCours(tuto([etape(1, 10)], { completedAt: 10 }))).toBeNull();
    expect(etapeEnCours(undefined)).toBeNull();
  });

  it('après une étape : tutoriel et solde posés tout de suite', () => {
    const c = new QueryClient();
    c.setQueryData(['moi'], { wallet: { cash: 100, gems: 0 } } as MoiReponse);
    apresEtape(c, { ...tuto([etape(1, 10)]), wallet: { cash: 5_100, gems: 0 } });
    expect(c.getQueryData(['moi'])).toMatchObject({ wallet: { cash: 5_100 } });
    expect(c.getQueryData<TutorielReponse>(CLE_TUTORIEL)?.steps[0]?.completedAt).toBe(10);
  });
});
