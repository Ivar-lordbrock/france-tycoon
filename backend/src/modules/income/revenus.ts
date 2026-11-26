import {
  ajuster,
  apportBatiment,
  type ChantierFini,
  EFFETS_SAISONS_ACTIFS,
  facteurTaille,
  type ParametresRevenu,
  type ProfilSaison,
  partagerCumul,
  pctSaison,
  prochainLundiParis,
  revenuCumule,
  revenuJoueur,
  revenuTerritoire,
  saisonDeLaSemaine,
  semaineParis,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { creerRecalculLimite } from '../buildings/limites.ts';
import { emettre } from '../evenements/bus.ts';
import { type Calendrier, creerLecteurCalendrier } from '../reglages/calendrier.ts';
import { creerIssuesOpa } from '../takeovers/issues.ts';
import { wallet } from '../wallet/wallet.ts';

// Moteur des revenus passifs (docs/05-equilibrage.md, 5.3) : revenu par heure et encaissement par morceaux.

/** Colonnes de `building_types` (alias `bt`) qui jouent sur le revenu, au format de `ParametresRevenu`. */
export const COLONNES_REVENU = `bt.base_income_per_hour AS baseIncomePerHour, bt.income_growth AS incomeGrowth,
  bt.income_bonus_pct AS incomeBonusPct, bt.scales_with_territory AS scalesWithTerritory`;

/** Un bâtiment tel que le lit SQLite : `scalesWithTerritory` vaut 0 ou 1. */
export interface LigneBatimentRevenu extends Omit<ParametresRevenu, 'scalesWithTerritory'> {
  level: number;
  targetLevel: number | null;
  worksEndsAt: number | null;
  scalesWithTerritory: number;
}

/** Un bâtiment et ce qu'il faut pour calculer son revenu. */
export interface BatimentRevenu extends ParametresRevenu {
  level: number;
  targetLevel: number | null;
  worksEndsAt: number | null;
}

export function versBatimentRevenu<T extends LigneBatimentRevenu>(
  ligne: T,
): Omit<T, 'scalesWithTerritory'> & BatimentRevenu {
  return { ...ligne, scalesWithTerritory: ligne.scalesWithTerritory === 1 };
}

/** Un chantier fini compte dès sa date de fin, même si le serveur ne l'a pas encore noté. */
export function chantierFini(b: BatimentRevenu, instant: number): boolean {
  return b.targetLevel !== null && b.worksEndsAt !== null && b.worksEndsAt <= instant;
}

/** Niveau qui rapporte à l'instant `instant`. */
export function niveauEffectif(b: BatimentRevenu, instant: number): number {
  return chantierFini(b, instant) ? (b.targetLevel ?? b.level) : b.level;
}

/** R_T à l'instant `instant` : sol + bâtiments, bonus compris (5.3). */
export function revenuDuTerritoire(v0: number, batiments: readonly BatimentRevenu[], instant: number): number {
  const fT = facteurTaille(v0);
  return revenuTerritoire(
    v0,
    batiments.map((b) => apportBatiment(b, niveauEffectif(b, instant), fT)),
  );
}

export interface TerritoireRevenu {
  baseValue: number;
  batiments: BatimentRevenu[];
  /** Profil saisonnier (`territories.season_profile`) : sans profil, la saison ne change rien (5.12). */
  profil?: ProfilSaison | null;
}

/**
 * R_J à l'instant `instant`, multiplié par le réglage des revenus en % (dashboard /admin ; 100 = normal).
 * `saisons` : chaque R_T ajusté à la saison de son profil (5.12) ; coupé pendant la bêta.
 */
export function revenuDuJoueur(
  territoires: readonly TerritoireRevenu[],
  instant: number,
  pct = 100,
  saisons = EFFETS_SAISONS_ACTIFS,
): number {
  const saison = saisons ? saisonDeLaSemaine(semaineParis(instant)) : null;
  const revenus = territoires.map((t) => {
    const r = revenuDuTerritoire(t.baseValue, t.batiments, instant);
    return saison ? ajuster(r, pctSaison(t.profil, saison)) : r;
  });
  return ajuster(revenuJoueur(revenus), pct);
}

/**
 * Σ R_J × Δt depuis le dernier encaissement, par morceaux : le revenu change à chaque chantier fini
 * et à chaque changement de réglage (un événement ne compte que pendant ses dates).
 */
export function cumulDepuis(
  territoires: readonly TerritoireRevenu[],
  depuis: number,
  maintenant: number,
  reglages?: Calendrier,
  saisons = EFFETS_SAISONS_ACTIFS,
): number {
  const fins = new Set<number>(reglages?.ruptures);
  // Saisons : le revenu change aussi chaque lundi à minuit (heure de Paris).
  if (saisons) for (let l = prochainLundiParis(depuis); l < maintenant; l = prochainLundiParis(l)) fins.add(l);
  for (const { batiments } of territoires) {
    for (const b of batiments) {
      if (b.targetLevel !== null && b.worksEndsAt !== null && b.worksEndsAt > depuis && b.worksEndsAt <= maintenant) {
        fins.add(b.worksEndsAt);
      }
    }
  }
  const revenuA = (a: number) => revenuDuJoueur(territoires, a, reglages?.a(a).income, saisons);
  const changements = [...fins].map((a) => ({ a, revenuParHeure: revenuA(a) }));
  return revenuCumule(depuis, maintenant, revenuA(depuis), changements);
}

interface LigneTerritoire {
  id: number;
  baseValue: number;
  profil: ProfilSaison | null;
}

interface LigneBatimentJoueur extends LigneBatimentRevenu {
  id: number;
  territoryId: number;
  territoryInsee: string;
  territoryName: string;
  typeCode: string;
  name: string;
}

type BatimentJoueur = Omit<LigneBatimentJoueur, 'scalesWithTerritory'> & BatimentRevenu;

/** Les territoires d'un joueur et leurs bâtiments, prêts pour le calcul des revenus. */
export function creerLecteurRevenus(db: Base) {
  const territoires = db.prepare<[number], LigneTerritoire>(
    'SELECT id, base_value AS baseValue, season_profile AS profil FROM territories WHERE owner_id = ? ORDER BY id',
  );
  const batiments = db.prepare<[number], LigneBatimentJoueur>(`
    SELECT b.id, b.territory_id AS territoryId, t.insee_code AS territoryInsee, t.name AS territoryName,
      bt.code AS typeCode, bt.name, b.level, b.target_level AS targetLevel, b.works_ends_at AS worksEndsAt,
      ${COLONNES_REVENU}
    FROM buildings AS b
    JOIN territories AS t ON t.id = b.territory_id
    JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE t.owner_id = ?
    ORDER BY b.id`);

  /** Territoires du joueur, rangés par id, chacun avec ses bâtiments. */
  return function lireTerritoiresRevenu(moi: number): Map<number, TerritoireRevenu & { batiments: BatimentJoueur[] }> {
    const parTerritoire = new Map<number, TerritoireRevenu & { batiments: BatimentJoueur[] }>();
    for (const t of territoires.all(moi))
      parTerritoire.set(t.id, { baseValue: t.baseValue, profil: t.profil, batiments: [] });
    for (const ligne of batiments.all(moi))
      parTerritoire.get(ligne.territoryId)?.batiments.push(versBatimentRevenu(ligne));
    return parTerritoire;
  };
}

export interface Encaissement {
  /** ₮ encaissés cette fois (0 si moins d'un ₮ s'est accumulé). */
  collected: number;
  cash: number;
  /** Revenu par heure après l'encaissement (chantiers finis compris). */
  incomePerHour: number;
  /** Chantiers terminés depuis le dernier encaissement, dans l'ordre de fin. */
  finished: ChantierFini[];
}

/**
 * « Encaisse d'abord » (docs/04) : résout les OPA dont les 24 h sont passées, puis verse les revenus
 * en attente et termine les chantiers finis.
 * Doit tourner dans la transaction de l'action (`db.transaction(...).immediate()`), comme `wallet.apply`.
 */
export function creerEncaisseur(db: Base) {
  const encaisserSimple = creerEncaisseurSimple(db);
  // Une OPA échue change le propriétaire d'une commune à `expires_at` : elle passe avant le calcul,
  // sinon le défenseur toucherait les revenus de la commune après l'avoir perdue.
  const { resoudreEchues } = creerIssuesOpa(db, encaisserSimple);
  return function encaisser(moi: number, maintenant: number): Encaissement {
    if (!db.inTransaction) throw new Error('encaisser doit être appelé dans une transaction');
    resoudreEchues(maintenant);
    return encaisserSimple(moi, maintenant);
  };
}

/** Comme `creerEncaisseur`, sans résoudre les OPA (c'est la résolution qui l'appelle, à `expires_at`). */
export function creerEncaisseurSimple(db: Base) {
  const lireTerritoires = creerLecteurRevenus(db);
  const joueur = db.prepare<[number], { depuis: number; reste: number; cash: number }>(
    'SELECT income_collected_at AS depuis, income_remainder AS reste, cash FROM users WHERE id = ?',
  );
  const terminer = db.prepare<[number, number]>(`
    UPDATE buildings SET level = target_level, target_level = NULL, works_started_at = NULL,
      works_ends_at = NULL, works_cost = NULL, updated_at = ?
    WHERE id = ? AND target_level IS NOT NULL`);
  const notifier = db.prepare<[number, string, number]>(
    "INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, 'building_done', ?, ?)",
  );
  const noter = db.prepare<[number, number, number]>(
    'UPDATE users SET income_collected_at = ?, income_remainder = ? WHERE id = ?',
  );
  const recalculerLimite = creerRecalculLimite(db);
  const lireReglages = creerLecteurCalendrier(db);

  return function encaisser(moi: number, maintenant: number): Encaissement {
    if (!db.inTransaction) throw new Error('encaisser doit être appelé dans une transaction');
    const j = joueur.get(moi);
    if (!j) throw new Error(`Joueur inconnu : ${moi}`);

    const territoires = [...lireTerritoires(moi).values()];
    const reglages = lireReglages(j.depuis, maintenant);
    const { gain, reste } = partagerCumul(cumulDepuis(territoires, j.depuis, maintenant, reglages), j.reste);

    // Chantiers finis : le niveau visé devient le niveau actif ; un message pour le résumé au retour.
    const finis = territoires
      .flatMap((t) => t.batiments)
      .filter((b) => chantierFini(b, maintenant))
      .sort((x, y) => (x.worksEndsAt ?? 0) - (y.worksEndsAt ?? 0) || x.id - y.id);
    const finished = finis.map((b): ChantierFini => {
      const finishedAt = b.worksEndsAt ?? maintenant;
      const fini: ChantierFini = {
        buildingId: b.id,
        territoryInsee: b.territoryInsee,
        territoryName: b.territoryName,
        typeCode: b.typeCode,
        name: b.name,
        level: b.targetLevel ?? b.level,
        finishedAt,
      };
      terminer.run(finishedAt, b.id);
      notifier.run(moi, JSON.stringify(fini), finishedAt);
      // Quêtes : un chantier compte quand il est fini (annulé, il est remboursé et ne compte pas).
      const kind = b.typeCode;
      emettre(db, { userId: moi, type: 'building_started', tirer: false, kind }, maintenant);
      if (fini.level > 1) emettre(db, { userId: moi, type: 'building_upgraded', tirer: false, kind }, maintenant);
      return fini;
    });

    // Un siège social qui monte de niveau donne un territoire de plus.
    if (finished.length > 0) recalculerLimite(moi);

    let cash = j.cash;
    if (gain > 0) {
      cash = wallet.apply(db, {
        userId: moi,
        currency: 'cash',
        amount: gain,
        reason: 'income_collect',
        metadata: { since: j.depuis, until: maintenant },
      }).balance;
    }
    const nouveauDepuis = Math.max(j.depuis, maintenant);
    if (nouveauDepuis !== j.depuis || reste !== j.reste) noter.run(nouveauDepuis, reste, moi);

    const incomePerHour = revenuDuJoueur(territoires, maintenant, reglages.a(maintenant).income);
    return { collected: gain, cash, incomePerHour, finished };
  };
}
