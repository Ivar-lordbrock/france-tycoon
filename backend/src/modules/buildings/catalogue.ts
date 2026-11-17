import type { TypeBatiment } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

type LigneType = Omit<TypeBatiment, 'scalesWithTerritory'> & { scalesWithTerritory: 0 | 1 };

/**
 * Catalogue des bâtiments actifs (`building_types`, migrations 002 et 003), au format de
 * `typeBatimentSchema` : une entrée se passe telle quelle aux formules de balance.ts.
 * Ordre : celui du catalogue, siège social en dernier.
 */
export function creerLecteurCatalogue(db: Base): () => TypeBatiment[] {
  const requete = db.prepare<[], LigneType>(`
    SELECT code, name, category, description,
      base_cost AS baseCost, cost_growth AS costGrowth,
      base_income_per_hour AS baseIncomePerHour, income_growth AS incomeGrowth,
      income_bonus_pct AS incomeBonusPct, territory_slot_bonus AS territorySlotBonus,
      base_build_seconds AS baseBuildSeconds, time_growth AS timeGrowth,
      max_level AS maxLevel, slot_size AS slotSize,
      max_per_territory AS maxPerTerritory, max_per_user AS maxPerUser,
      min_population AS minPopulation, scales_with_territory AS scalesWithTerritory
    FROM building_types
    WHERE is_active = 1
    ORDER BY category = 'siege', id`);

  return () => requete.all().map((ligne) => ({ ...ligne, scalesWithTerritory: ligne.scalesWithTerritory === 1 }));
}
