import {
  type CategorieInfra,
  type CodeErreur,
  type ComptesInfra,
  type EtatTerritoire,
  equipementsRetenus,
  type FicheCommune,
  prixAchat,
  prixVenteEtat,
  valeurRevente,
  valeurTerritoire,
  type ZoneCode,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import {
  COLONNES_REVENU,
  chantierFini,
  type LigneBatimentRevenu,
  revenuDuTerritoire,
  versBatimentRevenu,
} from '../income/revenus.ts';
import { creerLecteurReglages } from '../reglages/calendrier.ts';
import { codesRefus, creerEvaluationOpa } from '../takeovers/conditions.ts';
import { creerLecteurJoueurAchat, raisonsAchat, raisonsVente } from './achat-vente.ts';

interface LigneTerritoire {
  id: number;
  insee: string;
  name: string;
  department: string;
  zone: ZoneCode;
  regionType: 'metropole' | 'outre_mer';
  population: number;
  areaKm2: number | null;
  lat: number;
  lng: number;
  infraScore: number;
  baseValue: number;
  /** Prix d'achat : forcé par un admin, sinon V0. */
  forcedPrice: number | null;
  slots: number;
  ownerId: number | null;
  fortification: number;
  /** Prix payé par le propriétaire (achat ou OPA), `null` si libre. */
  acquiredPrice: number | null;
  shieldUntil: number | null;
  isCapital: number;
  ownerPseudo: string | null;
  ownerColor: string | null;
  ownerAvatar: string | null;
}

interface LigneBatiment extends LigneBatimentRevenu {
  id: number;
  typeCode: string;
  name: string;
  slotSize: number;
  invested: number;
}

/** Requêtes préparées une fois pour la route GET /territories/:insee. */
export function creerLecteurFiche(db: Base) {
  const territoire = db.prepare<[string], LigneTerritoire>(`
    SELECT t.id, t.insee_code AS insee, t.name, t.department_code AS department, t.zone_code AS zone,
      t.region_type AS regionType, t.population, t.area_km2 AS areaKm2, t.center_lat AS lat, t.center_lng AS lng,
      t.infra_score AS infraScore, t.base_value AS baseValue, t.forced_price AS forcedPrice, t.building_slots AS slots, t.owner_id AS ownerId,
      t.fortification_value AS fortification, t.shield_until AS shieldUntil, t.is_capital AS isCapital, t.acquired_price AS acquiredPrice,
      u.pseudo AS ownerPseudo, u.marker_color AS ownerColor, u.avatar_url AS ownerAvatar
    FROM territories AS t LEFT JOIN users AS u ON u.id = t.owner_id
    WHERE t.insee_code = ?`);
  const stats = db.prepare<[number], { category: CategorieInfra; source: 'bpe' | 'osm'; count: number }>(
    'SELECT category, source, count FROM territory_stats WHERE territory_id = ?',
  );
  const batiments = db.prepare<[number], LigneBatiment>(`
    SELECT b.id, bt.code AS typeCode, bt.name, b.level, b.target_level AS targetLevel,
      b.works_ends_at AS worksEndsAt, bt.slot_size AS slotSize, b.invested_cash AS invested, ${COLONNES_REVENU}
    FROM buildings AS b JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE b.territory_id = ?
    ORDER BY b.id`);
  const opaEnCours = db.prepare<[number], { id: number; endsAt: number }>(
    "SELECT id, expires_at AS endsAt FROM takeovers WHERE territory_id = ? AND status = 'pending'",
  );
  const joueur = creerLecteurJoueurAchat(db);
  const evaluerOpa = creerEvaluationOpa(db);
  const reglages = creerLecteurReglages(db);

  /** La fiche d'une commune vue par `moi` (ou par un visiteur), `null` si le code INSEE est inconnu. */
  return function lireFiche(insee: string, moi: number | null, maintenant: number): FicheCommune | null {
    const t = territoire.get(insee);
    if (!t) return null;

    const comptes: ComptesInfra = {};
    for (const { category, source, count } of stats.all(t.id)) {
      comptes[category] = { ...comptes[category], [source]: count };
    }
    const liste = batiments.all(t.id).map(versBatimentRevenu);
    const investi = liste.reduce((total, b) => total + b.invested, 0);
    const opa = opaEnCours.get(t.id) ?? null;
    const bouclier = t.shieldUntil !== null && t.shieldUntil > maintenant ? t.shieldUntil : null;

    let state: EtatTerritoire;
    if (t.ownerId === null) state = 'free';
    else if (opa) state = 'takeover';
    else if (t.ownerId === moi) state = 'mine';
    else if (bouclier) state = 'shield';
    else state = 'rival';

    // Achat d'une commune libre (V0 × réglage, ou prix forcé par un admin) et vente à l'État : mêmes règles que les routes.
    const prix = prixAchat(t.baseValue, reglages(maintenant).price, t.forcedPrice);
    const buyReasons: CodeErreur[] = raisonsAchat(
      t.ownerId,
      moi,
      moi !== null && t.ownerId === null ? joueur.get(moi) : undefined,
      prix,
    );
    const sellReasons = raisonsVente(t.ownerId, moi, t.isCapital === 1, opa !== null);
    const totalValue = valeurTerritoire(t.baseValue, investi, t.fortification);
    // OPA : mêmes règles que le devis et le lancement (`takeovers/conditions.ts`).
    const takeoverReasons: CodeErreur[] =
      moi === null ? ['UNAUTHENTICATED'] : codesRefus(evaluerOpa(moi, { ...t, investi }, maintenant).refus);

    return {
      insee: t.insee,
      name: t.name,
      department: t.department,
      zone: t.zone,
      regionType: t.regionType,
      population: t.population,
      areaKm2: t.areaKm2,
      center: { lat: t.lat, lng: t.lng },
      infraScore: t.infraScore,
      equipments: equipementsRetenus(comptes),
      baseValue: t.baseValue,
      totalValue,
      incomePerHour: revenuDuTerritoire(t.baseValue, liste, maintenant),
      buildingSlots: { total: t.slots, used: liste.reduce((total, b) => total + b.slotSize, 0) },
      state,
      owner:
        t.ownerId === null
          ? null
          : {
              pseudo: t.ownerPseudo ?? '',
              markerColor: t.ownerColor ?? '#2563eb',
              avatarUrl: t.ownerAvatar,
              isMe: t.ownerId === moi,
            },
      isCapital: t.isCapital === 1,
      shieldUntil: bouclier,
      takeover: opa,
      // Un chantier fini s'affiche terminé, même si son propriétaire n'est pas encore revenu le valider.
      buildings: liste.map((b) =>
        chantierFini(b, maintenant)
          ? {
              id: b.id,
              typeCode: b.typeCode,
              name: b.name,
              level: b.targetLevel ?? b.level,
              targetLevel: null,
              worksEndsAt: null,
            }
          : {
              id: b.id,
              typeCode: b.typeCode,
              name: b.name,
              level: b.level,
              targetLevel: b.targetLevel,
              worksEndsAt: b.worksEndsAt,
            },
      ),
      actions: {
        canBuy: buyReasons.length === 0,
        buyPrice: t.ownerId === null ? prix : null,
        buyReasons,
        canSell: sellReasons.length === 0,
        sellPrice:
          moi !== null && t.ownerId === moi
            ? prixVenteEtat(valeurRevente(t.baseValue, t.acquiredPrice, investi, t.fortification))
            : null,
        sellReasons,
        canTakeover: takeoverReasons.length === 0,
        takeoverReasons,
      },
    };
  };
}
