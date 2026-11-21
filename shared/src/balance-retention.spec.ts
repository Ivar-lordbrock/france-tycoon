import { describe, expect, it } from 'vitest';
import { jourParis, nouveauRang, prochainMinuitParis, RANGS, rangDuPatrimoine, recompenseQuete } from './balance.ts';

/** Secondes Unix d'une date UTC (mois de 1 à 12). */
const utc = (annee: number, mois: number, jour: number, heure = 0, minute = 0, seconde = 0) =>
  Date.UTC(annee, mois - 1, jour, heure, minute, seconde) / 1000;

describe('rangs (5.4)', () => {
  it('le plus haut rang dont le seuil est atteint', () => {
    expect(rangDuPatrimoine(0)).toBe(0);
    expect(rangDuPatrimoine(249_999)).toBe(0);
    expect(rangDuPatrimoine(250_000)).toBe(1);
    expect(rangDuPatrimoine(2_500_000)).toBe(2);
    expect(rangDuPatrimoine(24_999_999)).toBe(2);
    expect(rangDuPatrimoine(25_000_000)).toBe(3);
    expect(rangDuPatrimoine(250_000_000)).toBe(4);
    expect(rangDuPatrimoine(10 ** 12)).toBe(RANGS.length - 1);
  });

  it('le rang ne redescend jamais, même si le patrimoine baisse', () => {
    expect(nouveauRang(2, 100)).toBe(2);
    expect(nouveauRang(0, 3_000_000)).toBe(2);
    expect(nouveauRang(3, 300_000_000)).toBe(4);
  });
});

describe('jour du jeu à Paris (5.7)', () => {
  it('change à minuit, heure de Paris, en hiver (UTC+1) comme en été (UTC+2)', () => {
    expect(jourParis(utc(2026, 11, 17, 22, 59, 59))).toBe('2026-11-17');
    expect(jourParis(utc(2026, 11, 17, 23))).toBe('2026-11-18');
    expect(jourParis(utc(2026, 7, 14, 21, 59, 59))).toBe('2026-07-14');
    expect(jourParis(utc(2026, 7, 14, 22))).toBe('2026-07-15');
    expect(jourParis(utc(2026, 12, 31, 23))).toBe('2027-01-01');
  });

  it('prochain minuit : strictement après, changements d’heure et fin d’année compris', () => {
    expect(prochainMinuitParis(utc(2026, 11, 17, 12))).toBe(utc(2026, 11, 17, 23));
    expect(prochainMinuitParis(utc(2026, 7, 14, 12))).toBe(utc(2026, 7, 14, 22));
    // Pile à minuit : c'est le minuit suivant.
    expect(prochainMinuitParis(utc(2026, 11, 17, 23))).toBe(utc(2026, 11, 18, 23));
    // Passage à l'heure d'été le 29/03/2026 (journée de 23 h), à l'heure d'hiver le 25/10/2026 (25 h).
    expect(prochainMinuitParis(utc(2026, 3, 28, 12))).toBe(utc(2026, 3, 28, 23));
    expect(prochainMinuitParis(utc(2026, 3, 29, 12))).toBe(utc(2026, 3, 29, 22));
    expect(prochainMinuitParis(utc(2026, 10, 24, 12))).toBe(utc(2026, 10, 24, 22));
    expect(prochainMinuitParis(utc(2026, 10, 25, 12))).toBe(utc(2026, 10, 25, 23));
    expect(prochainMinuitParis(utc(2026, 12, 31, 12))).toBe(utc(2026, 12, 31, 23));
  });

  it('toute l’année : le jour change pile au prochain minuit', () => {
    for (let instant = utc(2026, 1, 1, 5, 17); instant < utc(2027, 1, 1); instant += 86_400 + 3_607) {
      const minuit = prochainMinuitParis(instant);
      expect(minuit).toBeGreaterThan(instant);
      expect(jourParis(minuit - 1)).toBe(jourParis(instant));
      expect(jourParis(minuit)).not.toBe(jourParis(instant));
    }
  });
});

describe('récompense d’une quête (5.7)', () => {
  it('max( cash_min ; arrondi_100( h × revenu/h ) )', () => {
    // Joueur du premier jour (5.9) : 1 103 ₮/h.
    expect(recompenseQuete(1.5, 1_103, 800)).toBe(1_700);
    expect(recompenseQuete(2.5, 1_103, 1_500)).toBe(2_800);
    expect(recompenseQuete(4, 1_103, 3_000)).toBe(4_400);
    // Sans revenu, le minimum.
    expect(recompenseQuete(1, 0, 500)).toBe(500);
  });
});
