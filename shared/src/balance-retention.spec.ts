import { describe, expect, it } from 'vitest';
import {
  APPELS_A_PROJETS,
  appelDeLaSemaine,
  EFFETS_SAISONS_ACTIFS,
  jourParis,
  nouveauRang,
  pctSaison,
  primeProjet,
  prochainLundiParis,
  prochainMinuitParis,
  RANGS,
  rangDuPatrimoine,
  recompenseQuete,
  SAISONS,
  saisonDeLaSemaine,
  semaineParis,
} from './balance.ts';

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

describe('semaine des appels à projets (5.11)', () => {
  it('la semaine est le lundi à Paris ; elle change le lundi à minuit', () => {
    expect(semaineParis(utc(2026, 11, 26, 12))).toBe('2026-11-23');
    expect(semaineParis(utc(2026, 11, 29, 22, 59, 59))).toBe('2026-11-23'); // dimanche 23:59:59 à Paris
    expect(semaineParis(utc(2026, 11, 29, 23))).toBe('2026-11-30');
    expect(semaineParis(utc(2027, 1, 1, 12))).toBe('2026-12-28');
  });

  it('prochain lundi minuit : strictement après, changements d’heure compris', () => {
    expect(prochainLundiParis(utc(2026, 11, 26, 12))).toBe(utc(2026, 11, 29, 23));
    expect(prochainLundiParis(utc(2026, 7, 15, 12))).toBe(utc(2026, 7, 19, 22));
    expect(prochainLundiParis(utc(2026, 11, 29, 23))).toBe(utc(2026, 12, 6, 23)); // pile lundi minuit
    expect(prochainLundiParis(utc(2026, 3, 25, 12))).toBe(utc(2026, 3, 29, 22)); // heure d'été le dimanche 29
    expect(prochainLundiParis(utc(2026, 10, 21, 12))).toBe(utc(2026, 10, 25, 23)); // heure d'hiver le dimanche 25
  });

  it('les projets tournent : tous passent en 5 semaines, jamais deux fois de suite', () => {
    const codes: string[] = [];
    for (let t = utc(2026, 11, 23, 12); codes.length < APPELS_A_PROJETS.length * 2; t += 7 * 86_400) {
      codes.push(appelDeLaSemaine(semaineParis(t)).code);
    }
    expect(new Set(codes.slice(0, APPELS_A_PROJETS.length)).size).toBe(APPELS_A_PROJETS.length);
    for (let i = 1; i < codes.length; i++) expect(codes[i]).not.toBe(codes[i - 1]);
    expect(appelDeLaSemaine('2026-11-23')).toBe(appelDeLaSemaine('2026-11-23'));
  });

  it('prime : 15 000 ₮ au moins, sinon 12 heures de revenu arrondies à la centaine', () => {
    expect(primeProjet(0)).toBe(15_000);
    expect(primeProjet(1_000)).toBe(15_000);
    expect(primeProjet(2_049)).toBe(24_600);
  });
});

describe('saisons (5.12)', () => {
  it('une saison par semaine, dans l’ordre, puis on recommence', () => {
    const semaines = Array.from({ length: 8 }, (_, i) => semaineParis(utc(2026, 11, 25) + i * 7 * 86_400));
    const saisons = semaines.map(saisonDeLaSemaine);
    const depart = SAISONS.indexOf(saisons[0] as (typeof SAISONS)[number]);
    expect(saisons).toEqual(Array.from({ length: 8 }, (_, i) => SAISONS[(depart + i) % 4]));
  });

  it('bonus par profil ; sans profil, 100 %', () => {
    expect(pctSaison('littoral', 'ete')).toBe(150);
    expect(pctSaison('littoral', 'hiver')).toBe(90);
    expect(pctSaison('montagne', 'hiver')).toBe(150);
    expect(pctSaison('montagne', 'ete')).toBe(100);
    expect(pctSaison('rural', 'printemps')).toBe(120);
    expect(pctSaison('rural', 'automne')).toBe(120);
    expect(pctSaison(null, 'ete')).toBe(100);
  });

  it('coupées pendant la bêta', () => {
    expect(EFFETS_SAISONS_ACTIFS).toBe(false);
  });
});
