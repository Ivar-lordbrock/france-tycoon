import {
  type CategorieInfra,
  type CodeErreur,
  type ComptesInfra,
  type EtatTerritoire,
  equipementsRetenus,
  type FicheCommune,
  prixVenteEtat,
  revenuSol,
  valeurTerritoire,
  type ZoneCode,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
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
  slots: number;
  ownerId: number | null;
  fortification: number;
  shieldUntil: number | null;
  isCapital: number;
  ownerPseudo: string | null;
  ownerColor: string | null;
  ownerAvatar: string | null;
}

interface LigneBatiment {
  id: number;
  typeCode: string;
  name: string;
  level: number;
  targetLevel: number | null;
  worksEndsAt: number | null;
  slotSize: number;
  invested: number;
}

/** Requêtes préparées une fois pour la route GET /territories/:insee. */
export function creerLecteurFiche(db: Base) {
  const territoire = db.prepare<[string], LigneTerritoire>(`
    SELECT t.id, t.insee_code AS insee, t.name, t.department_code AS department, t.zone_code AS zone,
      t.region_type AS regionType, t.population, t.area_km2 AS areaKm2, t.center_lat AS lat, t.center_lng AS lng,
      t.infra_score AS infraScore, t.base_value AS baseValue, t.building_slots AS slots, t.owner_id AS ownerId,
      t.fortification_value AS fortification, t.shield_until AS shieldUntil, t.is_capital AS isCapital,
      u.pseudo AS ownerPseudo, u.marker_color AS ownerColor, u.avatar_url AS ownerAvatar
    FROM territories AS t LEFT JOIN users AS u ON u.id = t.owner_id
    WHERE t.insee_code = ?`);
  const stats = db.prepare<[number], { category: CategorieInfra; source: 'bpe' | 'osm'; count: number }>(
    'SELECT category, source, count FROM territory_stats WHERE territory_id = ?',
  );
  const batiments = db.prepare<[number], LigneBatiment>(`
    SELECT b.id, bt.code AS typeCode, bt.name, b.level, b.target_level AS targetLevel,
      b.works_ends_at AS worksEndsAt, bt.slot_size AS slotSize, b.invested_cash AS invested
    FROM buildings AS b JOIN building_types AS bt ON bt.id = b.building_type_id
    WHERE b.territory_id = ?
    ORDER BY b.id`);
  const opaEnCours = db.prepare<[number], { id: number; endsAt: number }>(
    "SELECT id, expires_at AS endsAt FROM takeovers WHERE territory_id = ? AND status = 'pending'",
  );
  const joueur = creerLecteurJoueurAchat(db);

  /** La fiche d'une commune vue par `moi` (ou par un visiteur), `null` si le code INSEE est inconnu. */
  return function lireFiche(insee: string, moi: number | null, maintenant: number): FicheCommune | null {
    const t = territoire.get(insee);
    if (!t) return null;

    const comptes: ComptesInfra = {};
    for (const { category, source, count } of stats.all(t.id)) {
      comptes[category] = { ...comptes[category], [source]: count };
    }
    const liste = batiments.all(t.id);
    const investi = liste.reduce((total, b) => total + b.invested, 0);
    const opa = opaEnCours.get(t.id) ?? null;
    const bouclier = t.shieldUntil !== null && t.shieldUntil > maintenant ? t.shieldUntil : null;

    let state: EtatTerritoire;
    if (t.ownerId === null) state = 'free';
    else if (opa) state = 'takeover';
    else if (t.ownerId === moi) state = 'mine';
    else if (bouclier) state = 'shield';
    else state = 'rival';

    // Achat d'une commune libre (prix = V0) et vente à l'État : mêmes règles que les routes.
    const buyReasons: CodeErreur[] = raisonsAchat(
      t.ownerId,
      moi,
      moi !== null && t.ownerId === null ? joueur.get(moi) : undefined,
      t.baseValue,
    );
    const sellReasons = raisonsVente(t.ownerId, moi, t.isCapital === 1, opa !== null);
    const totalValue = valeurTerritoire(t.baseValue, investi, t.fortification);
    // OPA : ouvertes à l'étape 4 ; d'ici là, seulement signalées comme indisponibles chez un rival.
    const chezUnRival = t.ownerId !== null && t.ownerId !== moi;

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
      // Revenu du sol (5.3) ; celui des bâtiments arrive avec l'étape 3.
      incomePerHour: revenuSol(t.baseValue),
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
      buildings: liste.map(({ slotSize: _taille, invested: _investi, ...b }) => b),
      actions: {
        canBuy: buyReasons.length === 0,
        buyPrice: t.ownerId === null ? t.baseValue : null,
        buyReasons,
        canSell: sellReasons.length === 0,
        sellPrice: moi !== null && t.ownerId === moi ? prixVenteEtat(totalValue) : null,
        sellReasons,
        canTakeover: false,
        takeoverReasons: chezUnRival ? ['FEATURE_DISABLED'] : [],
      },
    };
  };
}
