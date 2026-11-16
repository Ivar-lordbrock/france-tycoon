import type { CommuneCarte } from '@france-tycoon/shared';
import type { Detail } from './cases.ts';

export interface CommuneVoulue {
  detail: Detail;
  commune: CommuneCarte;
}

/** Une case chargée et ses communes. */
export interface CaseChargee {
  detail: Detail;
  communes: CommuneCarte[];
}

/** Communes à dessiner, sans doublon : une commune à cheval sur deux cases n'est dessinée qu'une fois. */
export function communesVoulues(cases: readonly CaseChargee[]): Map<string, CommuneVoulue> {
  const voulues = new Map<string, CommuneVoulue>();
  for (const { detail, communes } of cases) {
    for (const commune of communes) {
      if (!voulues.has(commune.id)) voulues.set(commune.id, { detail, commune });
    }
  }
  return voulues;
}

export interface Affiche {
  detail: Detail;
  commune: CommuneCarte;
}

export interface Plan {
  ajouter: CommuneVoulue[];
  retirer: string[];
}

/**
 * Différence entre ce qui est dessiné et ce qu'il faut dessiner. Tant qu'une case de la vue charge,
 * on ne retire rien : l'ancien dessin (autre détail, autre vue) reste à l'écran au lieu d'un trou.
 * Une commune redessinée quand son détail ou son état change.
 */
export function planifier(
  affichees: ReadonlyMap<string, Affiche>,
  voulues: ReadonlyMap<string, CommuneVoulue>,
  toutEstCharge: boolean,
): Plan {
  const ajouter: CommuneVoulue[] = [];
  const retirer: string[] = [];
  for (const [insee, voulue] of voulues) {
    const affichee = affichees.get(insee);
    if (!affichee) {
      ajouter.push(voulue);
    } else if (affichee.detail !== voulue.detail || !memesProprietes(affichee.commune, voulue.commune)) {
      retirer.push(insee);
      ajouter.push(voulue);
    }
  }
  if (toutEstCharge) {
    for (const insee of affichees.keys()) if (!voulues.has(insee)) retirer.push(insee);
  }
  return { ajouter, retirer };
}

function memesProprietes(a: CommuneCarte, b: CommuneCarte): boolean {
  const p = a.properties;
  const q = b.properties;
  return p.state === q.state && p.ownerColor === q.ownerColor && p.ownerPseudo === q.ownerPseudo && p.name === q.name;
}
