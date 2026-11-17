import type { MesOpaQuery, Opa, OpaReponse, Portefeuille, RoleOpa } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { creerEncaisseur, creerEncaisseurSimple } from '../income/revenus.ts';
import { mouvementDejaFait } from '../wallet/idempotence.ts';
import { creerIssuesOpa, type OpaATerminer } from './issues.ts';
import { creerLecteurOpa } from './lecture.ts';

// Routes /takeovers/:id (défendre, accepter, retirer, détail) et GET /me/takeovers (docs/04 « PvP : OPA »).

type Reponse = 'defend' | 'accept' | 'cancel';

/** Qui peut répondre quoi : le défenseur défend ou accepte, l'attaquant retire. */
const ROLE_ATTENDU: Record<Reponse, RoleOpa> = { defend: 'defender', accept: 'defender', cancel: 'attacker' };
const REFUS_ROLE: Record<Reponse, string> = {
  defend: 'Seul le propriétaire de la commune peut défendre.',
  accept: 'Seul le propriétaire de la commune peut accepter l’offre.',
  cancel: 'Seul l’auteur de l’OPA peut la retirer.',
};

export function creerReponsesOpa(db: Base) {
  const encaisser = creerEncaisseur(db);
  const issues = creerIssuesOpa(db, creerEncaisseurSimple(db));
  const lireOpa = creerLecteurOpa(db);
  const portefeuille = db.prepare<[number], Portefeuille>(
    'SELECT cash, premium_currency AS gems FROM users WHERE id = ?',
  );
  const mesIds = db
    .prepare<{ moi: number; role: string | null; statut: string | null }, number>(`
      SELECT id FROM takeovers
      WHERE ((@role IS NULL AND (attacker_id = @moi OR defender_id = @moi))
          OR (@role = 'attacker' AND attacker_id = @moi)
          OR (@role = 'defender' AND defender_id = @moi))
        AND (@statut IS NULL OR status = @statut)
      ORDER BY created_at DESC, id DESC
      LIMIT 100`)
    .pluck();

  /** L'OPA `id` si `moi` y joue un rôle, sinon 404 (on ne dit pas qu'elle existe). */
  function trouver(moi: number, id: number): OpaATerminer {
    const o = issues.lire(id);
    if (!o || (o.attackerId !== moi && o.defenderId !== moi)) {
      throw new ErreurMetier('NOT_FOUND', 404, 'Cette OPA n’existe pas.');
    }
    return o;
  }

  function vue(id: number, moi: number): Opa {
    const opa = lireOpa(id, moi);
    if (!opa) throw new Error(`OPA ${id} illisible pour le joueur ${moi}`);
    return opa;
  }

  function repondre(reponse: Reponse, moi: number, id: number, maintenant: number, cle?: string): OpaReponse {
    // Les OPA échues d'abord, dans leur propre transaction : un refus ci-dessous ne les annule pas.
    issues.resoudreEchues(maintenant);
    db.transaction(() => {
      encaisser(moi, maintenant);
      const o = trouver(moi, id);

      const deja = mouvementDejaFait(db, cle);
      if (deja) {
        if (deja.refId !== o.id) {
          throw new ErreurMetier('VALIDATION_ERROR', 400, 'Cette clé Idempotency-Key a déjà servi pour autre chose.');
        }
        return; // réponse rejouée : on renvoie l'état actuel
      }

      const role: RoleOpa = o.attackerId === moi ? 'attacker' : 'defender';
      if (role !== ROLE_ATTENDU[reponse]) throw new ErreurMetier('FORBIDDEN', 403, REFUS_ROLE[reponse]);
      if (o.status !== 'pending') {
        throw new ErreurMetier('TAKEOVER_NOT_PENDING', 409, 'Cette OPA est déjà terminée.', { status: o.status });
      }

      if (reponse === 'defend') issues.defendre(o, maintenant, cle);
      else if (reponse === 'accept') issues.transferer(o, 'accepted', maintenant);
      else issues.retirer(o, maintenant, cle);
    }).immediate();

    const solde = portefeuille.get(moi);
    if (!solde) throw new Error(`Joueur inconnu : ${moi}`);
    return { takeover: vue(id, moi), wallet: solde };
  }

  return {
    /** POST /takeovers/:id/defend : le défenseur paie la défense et garde sa commune. */
    defendre: (moi: number, id: number, maintenant: number, cle?: string) =>
      repondre('defend', moi, id, maintenant, cle),
    /** POST /takeovers/:id/accept : le défenseur vend tout de suite. */
    accepter: (moi: number, id: number, maintenant: number) => repondre('accept', moi, id, maintenant),
    /** POST /takeovers/:id/cancel : l'attaquant retire son offre (l'indemnité est versée quand même). */
    retirer: (moi: number, id: number, maintenant: number, cle?: string) =>
      repondre('cancel', moi, id, maintenant, cle),

    /** GET /takeovers/:id : résout d'abord les OPA échues (exact à la seconde, sans attendre la tâche). */
    detail(moi: number, id: number, maintenant: number): Opa {
      issues.resoudreEchues(maintenant);
      trouver(moi, id);
      return vue(id, moi);
    },

    /** GET /me/takeovers : mes OPA (100 au plus), les plus récentes d'abord. */
    mesOpa(moi: number, filtre: MesOpaQuery, maintenant: number): Opa[] {
      issues.resoudreEchues(maintenant);
      return mesIds.all({ moi, role: filtre.role ?? null, statut: filtre.status ?? null }).map((id) => vue(id, moi));
    },
  };
}
