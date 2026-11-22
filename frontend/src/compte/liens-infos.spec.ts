import { describe, expect, it } from 'vitest';
import { lienAvis } from './LiensInfos.tsx';

describe('lienAvis (réglage VITE_AVIS_URL)', () => {
  it('garde le lien d’un formulaire ou un mailto:', () => {
    expect(lienAvis(' https://tally.so/r/abc ')).toBe('https://tally.so/r/abc');
    expect(lienAvis('mailto:avis@exemple.fr')).toBe('mailto:avis@exemple.fr');
  });

  it('transforme une adresse e-mail en mailto: avec un sujet', () => {
    expect(lienAvis('avis@exemple.fr')).toBe('mailto:avis@exemple.fr?subject=Mon%20avis%20sur%20Kadastr');
  });

  it('rien, ou un réglage invalide : pas de lien', () => {
    expect(lienAvis(undefined)).toBeNull();
    expect(lienAvis('  ')).toBeNull();
    expect(lienAvis('javascript:alert(1)')).toBeNull();
    expect(lienAvis('pas une adresse')).toBeNull();
  });
});
