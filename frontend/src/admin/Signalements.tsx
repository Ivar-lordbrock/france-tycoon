import type { LigneSignalement, StatutSignalement } from '@france-tycoon/shared';
import { type FormEvent, useState } from 'react';
import { useActionAdmin, useSignalementsAdmin } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { champ, Pastille, quand } from './Joueurs.tsx';
import { Section } from './VueEnsemble.tsx';

const STATUTS: Record<StatutSignalement, { libelle: string; classe: string }> = {
  open: { libelle: 'Nouveau', classe: 'bg-alerte/15 text-alerte' },
  in_progress: { libelle: 'En cours', classe: 'bg-surligneur/15 text-surligneur' },
  resolved: { libelle: 'Réglé', classe: 'bg-succes/15 text-succes' },
  rejected: { libelle: 'Sans suite', classe: 'bg-brume text-ardoise' },
};
const ORDRE = Object.keys(STATUTS) as StatutSignalement[];

/** Signalements des joueurs (toute l'équipe). Réglé ou sans suite : le joueur reçoit un message. */
export function Signalements() {
  const [status, setStatus] = useState<StatutSignalement>('open');
  const { data, error, isPending, isFetching } = useSignalementsAdmin(status);

  return (
    <div className="mt-8">
      <Section titre="Signalements des joueurs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Statut"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatutSignalement)}
              className={champ}
            >
              {ORDRE.map((s) => (
                <option key={s} value={s}>
                  {STATUTS[s].libelle}
                </option>
              ))}
            </select>
            {isFetching && !isPending && <span className="text-sm text-ardoise">Mise à jour…</span>}
          </div>
          {error ? (
            <p role="alert" className="text-danger">
              {messageErreur(error)}
            </p>
          ) : isPending ? (
            <p className="text-ardoise">Chargement…</p>
          ) : data.reports.length === 0 ? (
            <p className="text-ardoise">
              {status === 'open' ? 'Aucun nouveau signalement. Tout va bien.' : 'Rien dans ce statut.'}
            </p>
          ) : (
            <ul className="flex max-w-3xl flex-col gap-3">
              {data.reports.map((r) => (
                // Clé avec la date de mise à jour : le formulaire repart des valeurs enregistrées.
                <Carte key={`${r.id}-${r.updatedAt}`} r={r} />
              ))}
            </ul>
          )}
          <p className="text-sm text-ardoise">
            Les 100 plus récents de chaque statut. 5 signalements par joueur et par jour au plus.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Carte({ r }: { r: LigneSignalement }) {
  const envoi = useActionAdmin();
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState(r.staffNote ?? '');
  const change = status !== r.status || note.trim() !== (r.staffNote ?? '');
  const previent =
    (status === 'resolved' || status === 'rejected') && (r.status === 'open' || r.status === 'in_progress');

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    if (change)
      envoi.mutate({ methode: 'PATCH', url: `reports/${r.id}`, corps: { status, note: note.trim() || null } });
  };

  return (
    <li className="rounded-2xl border border-encre/15 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{r.player ? `${r.player.pseudo} (n° ${r.player.id})` : 'Compte supprimé'}</span>
        <span className="text-ardoise tabular-nums">{quand(r.createdAt)}</span>
        {r.page && <span className="font-mono text-xs text-ardoise">{r.page}</span>}
        <span className="ml-auto">
          <Pastille classe={STATUTS[r.status].classe}>{STATUTS[r.status].libelle}</Pastille>
        </span>
      </div>
      <p className="mt-2 break-words whitespace-pre-line">{r.body}</p>
      <form onSubmit={enregistrer} className="mt-3 flex flex-col gap-2 border-t border-encre/10 pt-3">
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Nouveau statut"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatutSignalement)}
            className={champ}
          >
            {ORDRE.map((s) => (
              <option key={s} value={s}>
                {STATUTS[s].libelle}
              </option>
            ))}
          </select>
          <input
            aria-label="Note de l’équipe"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Note de l’équipe (le joueur ne la voit pas)"
            className={`${champ} flex-1 basis-56`}
          />
          <button type="submit" disabled={!change || envoi.isPending} className="relief h-10 px-4">
            {envoi.isPending ? 'Envoi…' : 'Enregistrer'}
          </button>
        </div>
        {previent && <p className="text-xs text-ardoise">Le joueur recevra un message : son signalement est clos.</p>}
        {envoi.isError && (
          <p role="alert" className="text-sm text-danger">
            {messageErreur(envoi.error)}
          </p>
        )}
      </form>
    </li>
  );
}
