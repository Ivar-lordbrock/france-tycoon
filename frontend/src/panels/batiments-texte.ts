import {
  ajuster,
  apportBatiment,
  bonusNiveau,
  type ChantierFini,
  coutNiveau,
  DUREE_CHANTIER_TUTORIEL_S,
  dureeChantier,
  type FicheCommune,
  type FileConstruction,
  facteurTaille,
  PLAFOND_HORS_LIGNE_S,
  remboursementDemolition,
  revenuNiveau,
  revenuTerritoire,
  type TypeBatiment,
} from '@france-tycoon/shared';
import { entier, tycoons } from './fiche-texte.ts';
import { duree } from './territoires-texte.ts';

// Aperçus de l'onglet « Bâtiments », minuteurs, argent qui monte et résumé au retour.
// Ce ne sont que des aperçus : le serveur recalcule tout au moment de payer (CLAUDE.md).

export type BatimentFiche = FicheCommune['buildings'][number];

/** Cash affiché entre deux lectures de /me : il monte de revenu/h ÷ 3 600 chaque seconde (docs/04 § 4.4). */
export function cashEnDirect(cash: number, revenuParHeure: number, ecouleMs: number): number {
  const secondes = Math.min(Math.max(0, ecouleMs) / 1000, PLAFOND_HORS_LIGNE_S);
  return cash + Math.floor((revenuParHeure * secondes) / 3_600);
}

/** Temps restant d'un chantier, à la seconde près sous l'heure : « 45 s », « 8 min 05 s », « 2 h 40 ». */
export function minuteur(secondes: number): string {
  const s = Math.max(0, Math.ceil(secondes));
  if (s < 60) return `${s} s`;
  if (s < 3_600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return duree(s);
}

/** Part du chantier déjà faite, entre 0 et 1. */
export function avancement(debut: number, fin: number, maintenant: number): number {
  if (fin <= debut) return 1;
  return Math.min(1, Math.max(0, (maintenant - debut) / (fin - debut)));
}

/**
 * Quand relire la file : juste après la fin du prochain chantier (le serveur le termine à la lecture),
 * jamais plus souvent que toutes les 2 s ; `false` sans chantier.
 */
export function prochaineRelecture(file: FileConstruction | undefined, maintenantMs: number): number | false {
  if (!file || file.works.length === 0) return false;
  const fin = Math.min(...file.works.map((w) => w.endsAt));
  return Math.max(2_000, fin * 1_000 - maintenantMs + 1_000);
}

/** Ce que fait un bâtiment à ce niveau : son revenu, son bonus ou ses territoires en plus. */
export function effet(type: TypeBatiment, niveau: number, fT: number): string {
  if (niveau === 0) return 'Rien encore';
  if (type.baseIncomePerHour > 0) return `${tycoons(revenuNiveau(type, niveau, fT))}/h`;
  if (type.incomeBonusPct > 0) return `+${bonusNiveau(type, niveau)} % sur la commune`;
  const territoires = type.territorySlotBonus * niveau;
  return `+${territoires} territoire${territoires > 1 ? 's' : ''} max`;
}

/** Ce qu'il y a dans l'onglet pour faire les aperçus. */
export interface Contexte {
  fiche: Pick<FicheCommune, 'baseValue' | 'population' | 'buildingSlots' | 'buildings'>;
  catalogue: readonly TypeBatiment[];
  /** Cash du joueur (celui qui monte à l'écran). */
  cash: number;
  /** Le joueur a déjà un siège social (une seule capitale par joueur). */
  aUnSiege: boolean;
  /** Tout premier chantier, pendant le tutoriel : il dure 10 s (le serveur décide, l'écran l'annonce). */
  premierChantier?: boolean;
  /** Réglage du coût des bâtiments en % (GET /status ; 100 = normal). */
  pctBatiment?: number;
}

type Niveaux = { id: number | null; typeCode: string; niveau: number }[];

const niveauxActuels = (ctx: Contexte): Niveaux =>
  ctx.fiche.buildings.map((b) => ({ id: b.id, typeCode: b.typeCode, niveau: b.level }));

/** Revenu de la commune avec ces bâtiments : même formule que le serveur (5.3, revenuTerritoire). */
function revenuAvec(ctx: Contexte, niveaux: Niveaux): number {
  const fT = facteurTaille(ctx.fiche.baseValue);
  const apports = niveaux.flatMap(({ typeCode, niveau }) => {
    const type = ctx.catalogue.find((t) => t.code === typeCode);
    return type && niveau > 0 ? [apportBatiment(type, niveau, fT)] : [];
  });
  return revenuTerritoire(ctx.fiche.baseValue, apports);
}

export interface ApercuChantier {
  cout: number;
  resteCash: number;
  /** Durée du chantier en secondes (le tout premier chantier du tutoriel est plus court : 10 s). */
  duree: number;
  /** Revenu de la commune par heure, avant et après le chantier fini. */
  revenu: { avant: number; apres: number };
  /** Pourquoi le chantier n'est pas possible ; `null` s'il l'est (la file est vérifiée à part). */
  raison: string | null;
}

/** Construire un bâtiment de ce type sur la commune (niveau 0 → 1). */
export function apercuConstruction(type: TypeBatiment, ctx: Contexte): ApercuChantier {
  const { fiche } = ctx;
  const cout = ajuster(coutNiveau(type, 1, facteurTaille(fiche.baseValue)), ctx.pctBatiment ?? 100, 10);
  const actuels = niveauxActuels(ctx);
  const libres = fiche.buildingSlots.total - fiche.buildingSlots.used;
  const ici = fiche.buildings.filter((b) => b.typeCode === type.code).length;

  let raison: string | null = null;
  if (fiche.population < type.minPopulation) raison = `Il faut ${entier(type.minPopulation)} habitants.`;
  else if (type.maxPerTerritory !== null && ici >= type.maxPerTerritory)
    raison = type.maxPerTerritory === 1 ? 'Déjà construit ici.' : `${type.maxPerTerritory} au plus par commune.`;
  else if (type.category === 'siege' && ctx.aUnSiege) raison = 'Tu as déjà un siège social.';
  else if (type.slotSize > libres)
    raison = libres === 0 ? 'Plus de place libre ici.' : `Il faut ${type.slotSize} places, il en reste ${libres}.`;
  else if (cout > ctx.cash) raison = `Il te manque ${tycoons(cout - ctx.cash)}.`;

  return {
    cout,
    resteCash: ctx.cash - cout,
    duree: ctx.premierChantier ? DUREE_CHANTIER_TUTORIEL_S : dureeChantier(type, 1),
    revenu: {
      avant: revenuAvec(ctx, actuels),
      apres: revenuAvec(ctx, [...actuels, { id: null, typeCode: type.code, niveau: 1 }]),
    },
    raison,
  };
}

/** Améliorer un bâtiment (niveau L → L + 1) ; il continue de rapporter au niveau L pendant le chantier. */
export function apercuAmelioration(type: TypeBatiment, batiment: BatimentFiche, ctx: Contexte): ApercuChantier {
  const actuels = niveauxActuels(ctx);
  const avant = revenuAvec(ctx, actuels);
  if (batiment.level >= type.maxLevel) {
    return { cout: 0, resteCash: ctx.cash, duree: 0, revenu: { avant, apres: avant }, raison: 'Niveau maximum.' };
  }
  const cible = batiment.level + 1;
  const cout = ajuster(coutNiveau(type, cible, facteurTaille(ctx.fiche.baseValue)), ctx.pctBatiment ?? 100, 10);
  return {
    cout,
    resteCash: ctx.cash - cout,
    duree: dureeChantier(type, cible),
    revenu: {
      avant,
      apres: revenuAvec(
        ctx,
        actuels.map((b) => (b.id === batiment.id ? { ...b, niveau: cible } : b)),
      ),
    },
    raison: cout > ctx.cash ? `Il te manque ${tycoons(cout - ctx.cash)}.` : null,
  };
}

/** Démolir : 30 % de ce qui a été payé pour ses niveaux (le serveur compte le prix vraiment payé). */
export function apercuDemolition(type: TypeBatiment, batiment: BatimentFiche, ctx: Contexte) {
  const fT = facteurTaille(ctx.fiche.baseValue);
  let investi = 0;
  for (let niveau = 1; niveau <= batiment.level; niveau++) investi += coutNiveau(type, niveau, fT);
  const actuels = niveauxActuels(ctx);
  return {
    rembourse: remboursementDemolition(investi),
    revenu: {
      avant: revenuAvec(ctx, actuels),
      apres: revenuAvec(
        ctx,
        actuels.filter((b) => b.id !== batiment.id),
      ),
    },
  };
}

/** « 513 ₮/h → 808 ₮/h », ou un seul montant s'il ne change pas. */
export function variation({ avant, apres }: { avant: number; apres: number }): string {
  return avant === apres ? `${tycoons(avant)}/h` : `${tycoons(avant)}/h → ${tycoons(apres)}/h`;
}

// Résumé au retour

/** Titre du résumé : « Pendant ton absence » si un chantier a fini avant l'ouverture de la page. */
export function titreResume(finis: readonly Pick<ChantierFini, 'finishedAt'>[], ouverture: number): string {
  if (finis.some((f) => f.finishedAt < ouverture)) return 'Pendant ton absence';
  return finis.length > 1 ? 'Chantiers terminés' : 'Chantier terminé';
}

/** « Résidence à L’Abergement-Clémenciat : niveau 2 atteint. » (sans accord : le nom peut être féminin.) */
export function phraseChantierFini(f: Pick<ChantierFini, 'name' | 'territoryName' | 'level'>): string {
  return `${f.name} à ${f.territoryName} : ${f.level === 1 ? 'construction terminée' : `niveau ${f.level} atteint`}.`;
}
