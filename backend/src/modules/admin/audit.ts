import type { Grade } from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';

export interface Acteur {
  id: number;
  pseudo: string;
  grade: Grade;
}

export interface Trace {
  action: string;
  cible: { type: string; id: number | string };
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
  motif?: string | null;
}

/** Journal d'audit du dashboard (table en ajout seul). À appeler dans la transaction de l'action. */
export function creerAudit(db: Base) {
  const inserer = db.prepare<unknown[]>(`
    INSERT INTO admin_audit
      (actor_id, actor_pseudo, actor_role, action, target_type, target_id, before_json, after_json, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const json = (v: Record<string, unknown> | null | undefined) => (v ? JSON.stringify(v) : null);

  return function auditer(acteur: Acteur, t: Trace): void {
    if (!db.inTransaction) throw new Error('auditer doit être appelé dans la transaction de l’action');
    inserer.run(
      acteur.id,
      acteur.pseudo,
      acteur.grade,
      t.action,
      t.cible.type,
      String(t.cible.id),
      json(t.avant),
      json(t.apres),
      t.motif ?? null,
    );
  };
}
