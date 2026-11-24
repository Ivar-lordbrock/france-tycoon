import {
  type LigneAlerte,
  type RegleTriche,
  TRICHE_IP_JOURS,
  TRICHE_OPA_JOURS,
  TRICHE_OPA_MIN,
  TRICHE_SOLDE_JOURS,
} from '@france-tycoon/shared';
import { type FormEvent, useState } from 'react';
import { useActionAdmin, useAlertes, useJournal } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { boutonSecondaire, petitBouton } from '../panels/Confirmer.tsx';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { ACTIONS_AUDIT, champ, montant, Pastille, quand, RAISONS, Table, valeurs } from './Joueurs.tsx';
import { Section } from './VueEnsemble.tsx';

const REGLES: Record<RegleTriche, { libelle: string; texte: (a: LigneAlerte) => string }> = {
  shared_ip: {
    libelle: 'Même adresse IP',
    texte: (a) =>
      `${a.count} comptes se sont connectés depuis la même adresse (IP hachée) en ${TRICHE_IP_JOURS} jours.`,
  },
  balance_jump: {
    libelle: 'Argent hors registre',
    texte: (a) =>
      `${a.currency === 'gems' ? `${entier(a.count)} gemmes` : tycoons(a.count)} apparus sur le compte sans mouvement dans le registre.`,
  },
  repeat_takeovers: {
    libelle: 'OPA répétées',
    texte: (a) => `${a.count} OPA entre ces deux joueurs en ${TRICHE_OPA_JOURS} jours.`,
  },
};

/** Vue « Anti-triche & logs » : alertes à classer (toute l'équipe), journaux, exports CSV (admins). */
export function Triche({ admin }: { admin: boolean }) {
  return (
    <div className="mt-4 flex flex-col gap-8">
      <Alertes />
      <Journaux admin={admin} />
    </div>
  );
}

function Alertes() {
  const { data, error, isPending } = useAlertes();
  const [classees, setClassees] = useState(false);
  const visibles = data?.alerts.filter((a) => classees || a.review === null) ?? [];

  return (
    <Section titre="Alertes">
      <div className="flex flex-col gap-4">
        <p className="max-w-3xl text-sm text-ardoise">
          Trois règles, recalculées à chaque lecture : même adresse IP ({TRICHE_IP_JOURS} j), argent apparu hors du
          registre ({TRICHE_SOLDE_JOURS} j), {TRICHE_OPA_MIN} OPA ou plus entre deux joueurs ({TRICHE_OPA_JOURS} j). Une
          alerte n’est pas une preuve : regarde la fiche du joueur avant d’agir.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={classees}
            onChange={(e) => setClassees(e.target.checked)}
            className="size-4 accent-surligneur"
          />
          Voir aussi les alertes classées
        </label>
        {error ? (
          <p role="alert" className="text-danger">
            {messageErreur(error)}
          </p>
        ) : isPending ? (
          <p className="text-ardoise">Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="text-ardoise">{classees ? 'Aucune alerte.' : 'Aucune alerte à classer. Tout va bien.'}</p>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-3">
            {visibles.map((a) => (
              <Carte key={a.key} a={a} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Carte({ a }: { a: LigneAlerte }) {
  const envoi = useActionAdmin();
  const [note, setNote] = useState('');
  const classer = (e: FormEvent) => {
    e.preventDefault();
    envoi.mutate({ methode: 'POST', url: 'cheat-alerts/review', corps: { key: a.key, note: note.trim() } });
  };

  return (
    <li className="rounded-2xl border border-encre/15 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <Pastille classe={a.review ? 'bg-brume text-ardoise' : 'bg-alerte/15 text-alerte'}>
          {REGLES[a.rule].libelle}
        </Pastille>
        <span className="font-semibold">{a.players.map((p) => `${p.pseudo} (n° ${p.id})`).join(', ')}</span>
        <span className="ml-auto text-ardoise tabular-nums">{quand(a.at)}</span>
      </div>
      <p className="mt-2">{REGLES[a.rule].texte(a)}</p>
      {a.review ? (
        <p className="mt-3 border-t border-encre/10 pt-3 text-sm text-ardoise">
          Classée par {a.review.by ?? 'un compte supprimé'}, {quand(a.review.at)} : {a.review.note}
        </p>
      ) : (
        <form onSubmit={classer} className="mt-3 flex flex-wrap gap-2 border-t border-encre/10 pt-3">
          <input
            aria-label="Ce que tu as vu (obligatoire)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={3}
            maxLength={500}
            required
            placeholder="Ce que tu as vu"
            className={`${champ} flex-1 basis-56`}
          />
          <button type="submit" disabled={note.trim().length < 3 || envoi.isPending} className="relief h-10 px-4">
            {envoi.isPending ? 'Envoi…' : 'Classer'}
          </button>
          {envoi.isError && (
            <p role="alert" className="basis-full text-sm text-danger">
              {messageErreur(envoi.error)}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

type IdJournal = 'activity' | 'audit' | 'errors';
const JOURNAUX: [IdJournal, string][] = [
  ['activity', 'Activité du jeu'],
  ['audit', 'Audit de l’équipe'],
  ['errors', 'Erreurs'],
];
const EXPORTS: [string, string][] = [
  ['players', 'Joueurs'],
  ['audit', 'Audit'],
  ['activity', 'Activité (30 j)'],
];

function Journaux({ admin }: { admin: boolean }) {
  const [id, setId] = useState<IdJournal>('activity');
  return (
    <Section titre="Journaux">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {JOURNAUX.map(([j, libelle]) => (
            <button
              key={j}
              type="button"
              aria-pressed={j === id}
              onClick={() => setId(j)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${
                j === id ? 'bg-encre text-fond' : 'bg-brume text-ardoise hover:text-encre'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
        {/* Un composant par journal : la liste gardée pendant la lecture reste du bon type. */}
        {id === 'activity' ? <Activite /> : id === 'audit' ? <Audit /> : <Erreurs />}
        {admin && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ardoise">
            Exporter en CSV (admins, e-mails compris) :
            {EXPORTS.map(([quoi, libelle]) => (
              <a
                key={quoi}
                href={`/api/v1/admin/export/${quoi}`}
                download
                className={`${boutonSecondaire} ${petitBouton} inline-flex items-center`}
              >
                {libelle}
              </a>
            ))}
          </p>
        )}
      </div>
    </Section>
  );
}

/** Champ de filtre : la recherche part à la validation. */
function Filtre({ aide, onChercher }: { aide: string; onChercher: (q: string) => void }) {
  const [saisie, setSaisie] = useState('');
  return (
    <search>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onChercher(saisie.trim());
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          type="search"
          aria-label={aide}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={aide}
          maxLength={100}
          className={`${champ} flex-1 basis-64`}
        />
        <button type="submit" className="relief h-10 px-4">
          Filtrer
        </button>
      </form>
    </search>
  );
}

function Etat({ error, isPending }: { error: Error | null; isPending: boolean }) {
  if (error)
    return (
      <p role="alert" className="text-danger">
        {messageErreur(error)}
      </p>
    );
  return isPending ? <p className="text-ardoise">Chargement…</p> : null;
}

function Activite() {
  const [q, setQ] = useState('');
  const { data, error, isPending, isFetching } = useJournal('activity', q);
  return (
    <>
      <Filtre aide="Pseudo ou n° du joueur" onChercher={setQ} />
      <Etat error={error} isPending={isPending} />
      {data && (
        <Table
          attente={isFetching}
          colonnes={[['Quand'], ['Joueur'], ['Raison'], ['Montant', true], ['Solde après', true]]}
          vide="Aucun mouvement d’argent."
          lignes={data.rows.map((l) => [
            l.id,
            [
              <span key="q" className="whitespace-nowrap">
                {quand(l.createdAt)}
              </span>,
              `${l.player.pseudo} (n° ${l.player.id})`,
              RAISONS[l.reason] ?? l.reason,
              <span key="m" className={`whitespace-nowrap tabular-nums ${l.amount > 0 ? 'text-succes' : ''}`}>
                {montant(l.amount, l.currency)}
              </span>,
              <span key="s" className="whitespace-nowrap tabular-nums">
                {l.currency === 'cash' ? tycoons(l.balanceAfter) : `${entier(l.balanceAfter)} gemmes`}
              </span>,
            ],
          ])}
        />
      )}
      <p className="text-sm text-ardoise">Les 100 plus récents. Chaque ₮ gagné ou dépensé passe par ce registre.</p>
    </>
  );
}

const CIBLES: Record<string, string> = {
  player: 'Joueur n°',
  territory: 'Commune',
  takeover: 'OPA n°',
  report: 'Signalement n°',
  event: 'Événement n°',
  alert: 'Alerte',
  export: 'Export',
};

function Audit() {
  const [q, setQ] = useState('');
  const { data, error, isPending, isFetching } = useJournal('audit', q);
  return (
    <>
      <Filtre aide="Action (ex. player), auteur ou n° de la cible" onChercher={setQ} />
      <Etat error={error} isPending={isPending} />
      {data && (
        <Table
          attente={isFetching}
          colonnes={[['Quand'], ['Qui'], ['Action'], ['Cible'], ['Avant → après'], ['Motif']]}
          vide="Aucune action de l’équipe."
          lignes={data.rows.map((l) => [
            l.id,
            [
              <span key="q" className="whitespace-nowrap">
                {quand(l.createdAt)}
              </span>,
              l.actor,
              ACTIONS_AUDIT[l.action] ?? l.action,
              <span key="c" className="break-all">
                {CIBLES[l.targetType] ?? l.targetType} {l.targetType === 'alert' ? '' : l.targetId}
              </span>,
              <span key="v" className="text-xs">
                {valeurs(l.before)} → {valeurs(l.after)}
              </span>,
              l.reason ?? '—',
            ],
          ])}
        />
      )}
      <p className="text-sm text-ardoise">Les 100 plus récentes. Le journal d’audit ne s’efface jamais.</p>
    </>
  );
}

function Erreurs() {
  const { data, error, isPending, isFetching } = useJournal('errors', '');
  return (
    <>
      <Etat error={error} isPending={isPending} />
      {data && (
        <Table
          attente={isFetching}
          colonnes={[['Quand'], ['Source'], ['Où'], ['Message']]}
          vide="Aucune erreur. Le serveur tourne bien."
          lignes={data.rows.map((l, i) => [
            `${l.source}-${l.at}-${i}`,
            [
              <span key="q" className="whitespace-nowrap">
                {quand(l.at)}
              </span>,
              <Pastille key="s" classe="bg-danger/15 text-danger">
                {l.source === 'api' ? 'API' : 'Tâche'}
              </Pastille>,
              <code key="o" className="text-xs">
                {l.place}
              </code>,
              <span key="m" className="break-words">
                {l.message}
              </span>,
            ],
          ])}
        />
      )}
      <p className="text-sm text-ardoise">
        Les 100 plus récentes : erreurs 500 de l’API (1 000 gardées) et tâches planifiées en erreur. Le détail complet
        reste dans le journal du serveur.
      </p>
    </>
  );
}
