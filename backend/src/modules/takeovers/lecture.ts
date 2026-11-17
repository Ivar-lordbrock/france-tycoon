import type { Opa, StatutOpa, ZoneCode } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

interface LigneOpa {
  id: number;
  attackerId: number;
  defenderId: number;
  insee: string;
  name: string;
  zone: ZoneCode;
  attackerPseudo: string;
  attackerColor: string;
  defenderPseudo: string;
  defenderColor: string;
  territoryValue: number;
  offerAmount: number;
  defenseCost: number;
  breakFee: number;
  status: StatutOpa;
  createdAt: number;
  expiresAt: number;
  resolvedAt: number | null;
}

/** Une OPA telle que la voit l'attaquant ou le défenseur (personne d'autre). */
export function creerLecteurOpa(db: Base) {
  const ligne = db.prepare<[number], LigneOpa>(`
    SELECT o.id, o.attacker_id AS attackerId, o.defender_id AS defenderId,
      t.insee_code AS insee, t.name, t.zone_code AS zone,
      a.pseudo AS attackerPseudo, a.marker_color AS attackerColor,
      d.pseudo AS defenderPseudo, d.marker_color AS defenderColor,
      o.territory_value AS territoryValue, o.offer_amount AS offerAmount, o.defense_cost AS defenseCost,
      o.break_fee AS breakFee, o.status, o.created_at AS createdAt, o.expires_at AS expiresAt,
      o.resolved_at AS resolvedAt
    FROM takeovers AS o
      JOIN territories AS t ON t.id = o.territory_id
      JOIN users AS a ON a.id = o.attacker_id
      JOIN users AS d ON d.id = o.defender_id
    WHERE o.id = ?`);

  /** `null` si l'OPA n'existe pas ou si `moi` n'y joue aucun rôle. */
  return function lireOpa(id: number, moi: number): Opa | null {
    const o = ligne.get(id);
    if (!o || (o.attackerId !== moi && o.defenderId !== moi)) return null;
    return {
      id: o.id,
      territory: { insee: o.insee, name: o.name, zone: o.zone },
      attacker: { pseudo: o.attackerPseudo, markerColor: o.attackerColor },
      defender: { pseudo: o.defenderPseudo, markerColor: o.defenderColor },
      role: o.attackerId === moi ? 'attacker' : 'defender',
      territoryValue: o.territoryValue,
      offerAmount: o.offerAmount,
      defenseCost: o.defenseCost,
      breakFee: o.breakFee,
      status: o.status,
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
      resolvedAt: o.resolvedAt,
    };
  };
}
