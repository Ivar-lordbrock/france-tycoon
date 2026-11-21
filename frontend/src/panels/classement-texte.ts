import { RANGS } from '@france-tycoon/shared';

// Textes du classement et des profils publics (docs/04, « Classement »).

/** « Entrepreneur », « Notable », « Baron »… */
export function nomRang(niveau: number): string {
  return RANGS.find((r) => r.niveau === niveau)?.nom ?? `niveau ${niveau}`;
}

/** « 1er », « 2e », « 147e ». */
export function place(rang: number): string {
  return rang === 1 ? '1er' : `${rang}e`;
}
