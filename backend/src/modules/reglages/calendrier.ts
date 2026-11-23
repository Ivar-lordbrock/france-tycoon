import { combinerPct, REGLAGES_NORMAUX, type Reglages } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

// Réglages à chaud (dashboard /admin, étape 6) : base permanente × événements en cours, à n'importe quel instant.
// Les revenus non encaissés se calculent par morceaux : chaque changement de réglage est une rupture.

/** Une version des réglages permanents, à partir de `debut`. */
export interface VersionReglages extends Reglages {
  debut: number;
}

/** Un événement : ses % multiplient la base de `debut` (compris) à `fin` (exclue : fin prévue ou annulation). */
export interface EvenementReglages extends Reglages {
  id: number;
  title: string;
  debut: number;
  fin: number;
}

export interface Calendrier {
  /** Réglages effectifs à l'instant `t`. */
  a(t: number): Reglages;
  /** Événements en cours à l'instant `t`. */
  evenementsA(t: number): EvenementReglages[];
  /** Instants où les réglages changent, dans ]depuis ; jusqua]. */
  ruptures: number[];
}

/** Calcul pur : `versions` triées par début croissant ; `evenements` qui touchent la fenêtre. */
export function calendrier(
  versions: readonly VersionReglages[],
  evenements: readonly EvenementReglages[],
  depuis: number,
  jusqua: number,
): Calendrier {
  const evenementsA = (t: number) => evenements.filter((e) => e.debut <= t && t < e.fin);
  const a = (t: number): Reglages => {
    let base: Reglages = REGLAGES_NORMAUX;
    for (const v of versions) if (v.debut <= t) base = v;
    const actifs = evenementsA(t);
    const effectif = (cle: keyof Reglages) =>
      combinerPct(
        base[cle],
        actifs.map((e) => e[cle]),
      );
    return { price: effectif('price'), income: effectif('income'), building: effectif('building') };
  };
  const instants = [...versions.map((v) => v.debut), ...evenements.flatMap((e) => [e.debut, e.fin])];
  const ruptures = [...new Set(instants.filter((t) => t > depuis && t <= jusqua))].sort((x, y) => x - y);
  return { a, evenementsA, ruptures };
}

const COLONNES = 'price_pct AS price, income_pct AS income, building_pct AS building, starts_at AS debut';

/** Lit en une fois les réglages qui touchent ]depuis ; jusqua] (tables minuscules : quelques lignes par mois). */
export function creerLecteurCalendrier(db: Base) {
  const versions = db.prepare<[number], VersionReglages>(
    `SELECT ${COLONNES} FROM live_config WHERE starts_at <= ? ORDER BY starts_at, id`,
  );
  const evenements = db.prepare<[number, number], EvenementReglages>(`
    SELECT id, title, ${COLONNES}, min(ends_at, coalesce(cancelled_at, ends_at)) AS fin FROM game_events
    WHERE starts_at <= ? AND min(ends_at, coalesce(cancelled_at, ends_at)) > ? AND coalesce(cancelled_at, ends_at) > starts_at
    ORDER BY starts_at, id`);
  return (depuis: number, jusqua = depuis): Calendrier =>
    calendrier(versions.all(jusqua), evenements.all(jusqua, depuis), depuis, jusqua);
}

/** Réglages effectifs à un instant (prix d'achat, coût des bâtiments, revenu affiché). */
export function creerLecteurReglages(db: Base) {
  const lire = creerLecteurCalendrier(db);
  return (instant: number): Reglages => lire(instant).a(instant);
}
