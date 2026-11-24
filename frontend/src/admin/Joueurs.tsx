import { type FicheJoueurReponse, FUSEAU_JEU, type Grade, type LigneJoueur, type Role } from '@france-tycoon/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { type FiltresJoueurs, useActionAdmin, useFicheJoueur, useRechercheJoueurs } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { boutonSecondaire, petitBouton } from '../panels/Confirmer.tsx';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { ilYa } from '../panels/notifications-texte.ts';
import { Chiffre, Section } from './VueEnsemble.tsx';

export const champ =
  'h-10 min-w-0 rounded-xl border border-encre/15 bg-fond px-3 text-encre outline-none placeholder:text-ardoise focus:border-encre focus:ring-2 focus:ring-surligneur';

const ROLES: Record<Role, string> = { player: 'Joueur', moderator: 'Modérateur', admin: 'Admin' };
const STATUTS = {
  active: { libelle: 'Actif', classe: 'bg-succes/15 text-succes' },
  dormant: { libelle: 'Dormant', classe: 'bg-brume text-ardoise' },
  suspended: { libelle: 'Suspendu', classe: 'bg-alerte/15 text-alerte' },
  banned: { libelle: 'Banni', classe: 'bg-danger/15 text-danger' },
  deleted: { libelle: 'Supprimé', classe: 'bg-brume text-ardoise' },
} as const;
const statutDe = (p: LigneJoueur) => (p.suspendedUntil !== null && p.status !== 'banned' ? 'suspended' : p.status);

export const RAISONS: Record<string, string> = {
  signup_bonus: 'Bonus d’inscription',
  income_collect: 'Revenus',
  territory_purchase: 'Achat de commune',
  territory_sale: 'Vente de commune',
  building_construction: 'Construction',
  building_upgrade: 'Amélioration',
  building_demolition_refund: 'Démolition',
  takeover_escrow: 'OPA : séquestre',
  takeover_refund: 'OPA : remboursement',
  takeover_payout: 'OPA : paiement',
  takeover_break_fee: 'OPA : indemnité',
  takeover_defense: 'OPA : défense',
  inactivity_buyback: 'Rachat pour inactivité',
  quest_reward: 'Quête',
  tutorial_reward: 'Tutoriel',
  shop_purchase: 'Boutique',
  gems_purchase: 'Achat de gemmes',
  gems_refund: 'Remboursement de gemmes',
  admin_adjustment: 'Ajustement admin',
};
export const ISSUES_OPA: Record<string, string> = {
  pending: 'En cours',
  defended: 'Défendue',
  accepted: 'Acceptée',
  succeeded: 'Réussie',
  cancelled: 'Retirée',
  voided: 'Annulée',
};
export const ACTIONS_AUDIT: Record<string, string> = {
  'note.add': 'Note ajoutée',
  'note.edit': 'Note modifiée',
  'note.delete': 'Note effacée',
  'player.suspend': 'Suspension',
  'player.unsuspend': 'Suspension levée',
  'player.ban': 'Bannissement',
  'player.unban': 'Bannissement levé',
  'player.role': 'Grade changé',
  'player.reset': 'Reset partiel',
  'player.adjust': 'Ajustement du solde',
  'gift.send': 'Cadeau',
  'territory.price': 'Prix forcé',
  'takeover.force': 'OPA forcée',
  'takeover.cancel': 'OPA annulée',
  'site.maintenance': 'Maintenance',
  'site.banner': 'Bannière',
  'report.update': 'Signalement suivi',
  'backup.create': 'Sauvegarde',
  'config.update': 'Réglages changés',
  'event.create': 'Événement lancé',
  'event.cancel': 'Événement arrêté',
  'alert.review': 'Alerte classée',
  'export.csv': 'Export CSV',
};

const format = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_JEU, dateStyle: 'medium', timeStyle: 'short' });
export const quand = (s: number) => format.format(s * 1000);
const maintenant = () => Math.floor(Date.now() / 1000);
const signe = (n: number, texte: string) => `${n > 0 ? '+' : '−'}${texte}`;
export const montant = (n: number, devise: 'cash' | 'gems') =>
  signe(n, devise === 'cash' ? tycoons(Math.abs(n)) : `${entier(Math.abs(n))} gemmes`);

/** « suspendedUntil : 12 nov. 2026, 14:00 · hours : 24 » : les valeurs avant/après d'une ligne d'audit. */
export function valeurs(v: Record<string, unknown> | null): string {
  if (!v) return '—';
  return Object.entries(v)
    .map(([cle, x]) => {
      const texte = cle.endsWith('Until') && typeof x === 'number' ? quand(x) : String(x ?? '—');
      return `${cle} : ${texte.length > 60 ? `${texte.slice(0, 60)}…` : texte}`;
    })
    .join(' · ');
}

/** Vue Joueurs : la liste, ou la fiche d'un joueur. Les filtres restent au retour de la fiche. */
export function Joueurs({ moi, grade }: { moi: string; grade: Grade }) {
  const [filtres, setFiltres] = useState<FiltresJoueurs>({ q: '', role: '', status: '' });
  const [id, setId] = useState<number | null>(null);
  return id === null ? (
    <Liste filtres={filtres} setFiltres={setFiltres} onOuvrir={setId} />
  ) : (
    <Fiche id={id} moi={moi} grade={grade} onRetour={() => setId(null)} />
  );
}

export function Pastille({ classe, children }: { classe: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${classe}`}>{children}</span>
  );
}

function Liste({
  filtres,
  setFiltres,
  onOuvrir,
}: {
  filtres: FiltresJoueurs;
  setFiltres: (f: FiltresJoueurs) => void;
  onOuvrir: (id: number) => void;
}) {
  const [saisie, setSaisie] = useState(filtres.q);
  const { data, error, isPending, isFetching } = useRechercheJoueurs(filtres);
  const chercher = (e: FormEvent) => {
    e.preventDefault();
    setFiltres({ ...filtres, q: saisie.trim() });
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <search>
        <form onSubmit={chercher} className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label="Chercher un joueur"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Pseudo, e-mail, id Google ou n°"
            maxLength={100}
            className={`${champ} flex-1 basis-64`}
          />
          <select
            aria-label="Grade"
            value={filtres.role}
            onChange={(e) => setFiltres({ ...filtres, role: e.target.value as FiltresJoueurs['role'] })}
            className={champ}
          >
            <option value="">Tous les grades</option>
            <option value="player">Joueurs</option>
            <option value="moderator">Modérateurs</option>
            <option value="admin">Admins</option>
          </select>
          <select
            aria-label="Statut"
            value={filtres.status}
            onChange={(e) => setFiltres({ ...filtres, status: e.target.value as FiltresJoueurs['status'] })}
            className={champ}
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="dormant">Dormants</option>
            <option value="suspended">Suspendus</option>
            <option value="banned">Bannis</option>
          </select>
          <button type="submit" className="relief h-10 px-4">
            Chercher
          </button>
        </form>
      </search>

      {error ? (
        <p role="alert" className="text-danger">
          {messageErreur(error)}
        </p>
      ) : isPending ? (
        <p className="text-ardoise">Chargement…</p>
      ) : (
        <>
          <Table
            colonnes={[['Joueur'], ['Grade'], ['Statut'], ['₮', true], ['Communes', true], ['Dernière action', true]]}
            vide="Aucun joueur ne correspond."
            attente={isFetching}
            lignes={data.players.map((p) => [
              p.id,
              [
                <span key="j" className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => onOuvrir(p.id)}
                    className="self-start text-left font-semibold underline-offset-4 hover:underline"
                  >
                    {p.pseudo}
                  </button>
                  <span className="text-xs text-ardoise">{p.email}</span>
                </span>,
                ROLES[p.role],
                <Pastille key="s" classe={STATUTS[statutDe(p)].classe}>
                  {STATUTS[statutDe(p)].libelle}
                </Pastille>,
                tycoons(p.cash),
                entier(p.territories),
                ilYa(p.lastActiveAt, maintenant()),
              ],
            ])}
          />
          {data.players.length === 50 && (
            <p className="text-sm text-ardoise">Seuls les 50 plus actifs s’affichent : affine la recherche.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Tableau simple ; `true` aligne la colonne à droite (chiffres). */
export function Table({
  colonnes,
  lignes,
  vide,
  attente = false,
}: {
  colonnes: [string, boolean?][];
  lignes: [number | string, ReactNode[]][];
  vide: string;
  attente?: boolean;
}) {
  const cellule = (droite?: boolean) => `px-4 py-2.5 ${droite ? 'text-right' : ''}`;
  return (
    <div className={`panneau overflow-x-auto transition-opacity duration-150 ${attente ? 'opacity-60' : ''}`}>
      <table className="w-full text-left text-sm">
        <thead className="text-ardoise">
          <tr className="border-b border-encre/10">
            {colonnes.map(([titre, droite]) => (
              <th key={titre} className={`${cellule(droite)} font-semibold whitespace-nowrap`}>
                {titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td colSpan={colonnes.length} className="px-4 py-3 text-ardoise">
                {vide}
              </td>
            </tr>
          )}
          {lignes.map(([cle, cellules]) => (
            <tr key={cle} className="border-b border-encre/10 last:border-0">
              {cellules.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes, jamais réordonnées
                <td key={i} className={cellule(colonnes[i]?.[1])}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fiche({ id, moi, grade, onRetour }: { id: number; moi: string; grade: Grade; onRetour: () => void }) {
  const { data, error, isPending } = useFicheJoueur(id);
  const retour = (
    <button
      type="button"
      onClick={onRetour}
      className="self-start rounded-full px-1 text-sm font-semibold text-ardoise hover:text-encre"
    >
      ← Liste des joueurs
    </button>
  );
  if (isPending)
    return (
      <div className="mt-3 flex flex-col gap-3">
        {retour}
        <p className="text-ardoise">Chargement…</p>
      </div>
    );
  if (error)
    return (
      <div className="mt-3 flex flex-col gap-3">
        {retour}
        <p role="alert" className="text-danger">
          {messageErreur(error)}
        </p>
      </div>
    );

  const { player: p, communes, transactions, takeovers, logins, notes, audit } = data;
  const statut = statutDe(p);
  // Le serveur tranche ; on cache juste ce qu'il refuserait à coup sûr.
  const touchable = p.pseudo !== moi && !p.roleFixe && (grade === 'admin' || p.role === 'player');

  return (
    <div className="mt-3 flex flex-col gap-8 [font-variant-numeric:tabular-nums]">
      {retour}
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-extrabold [font-stretch:112%]">{p.pseudo}</h2>
          <Pastille classe="bg-brume text-ardoise">{p.roleFixe ? 'Admin d’office' : ROLES[p.role]}</Pastille>
          <Pastille classe={STATUTS[statut].classe}>{STATUTS[statut].libelle}</Pastille>
        </div>
        <p className="text-sm break-all text-ardoise">
          {p.email} · n° {p.id} · Google {p.googleId}
        </p>
        <p className="text-sm text-ardoise">
          Inscrit le {quand(p.createdAt)} · dernière action {ilYa(p.lastActiveAt, maintenant())}
        </p>
      </header>

      {p.suspendedUntil !== null && (
        <p className="rounded-xl border border-alerte/40 bg-alerte/10 px-4 py-3 text-sm">
          Suspendu jusqu’au <strong>{quand(p.suspendedUntil)}</strong>. Motif : {p.suspensionReason}
        </p>
      )}

      <dl className="panneau grid grid-cols-2 divide-encre/10 sm:grid-cols-5 sm:divide-x">
        <Chiffre libelle="Cash">{tycoons(p.cash)}</Chiffre>
        <Chiffre libelle="Gemmes">{entier(p.gems)}</Chiffre>
        <Chiffre libelle="Revenus">{tycoons(p.incomePerHour)} / h</Chiffre>
        <Chiffre libelle="Communes">{entier(p.territories)}</Chiffre>
        <Chiffre libelle="Patrimoine">{tycoons(p.netWorth)}</Chiffre>
      </dl>

      {touchable && <Actions p={p} grade={grade} />}
      <Notes id={p.id} notes={notes} />

      <Section titre="Historique">
        <div className="flex flex-col gap-2">
          <Details titre={`Communes (${communes.length})`}>
            <Table
              colonnes={[['Commune'], ['INSEE'], ['Bâtiments', true], ['Depuis', true]]}
              vide="Aucune commune."
              lignes={communes.map((c) => [
                c.id,
                [
                  `${c.name}${c.isCapital ? ' · siège' : ''}`,
                  c.insee,
                  entier(c.buildings),
                  c.acquiredAt ? quand(c.acquiredAt) : '—',
                ],
              ])}
            />
          </Details>
          <Details titre="Transactions (50 dernières)">
            <Table
              colonnes={[['Quand'], ['Motif'], ['Montant', true], ['Solde après', true]]}
              vide="Aucune transaction."
              lignes={transactions.map((t) => [
                t.id,
                [
                  quand(t.createdAt),
                  RAISONS[t.reason] ?? t.reason,
                  montant(t.amount, t.currency),
                  t.currency === 'cash' ? tycoons(t.balanceAfter) : entier(t.balanceAfter),
                ],
              ])}
            />
          </Details>
          <Details titre="OPA (30 dernières)">
            <Table
              colonnes={[['Quand'], ['Commune'], ['Rôle'], ['Face à'], ['Offre', true], ['Issue']]}
              vide="Aucune OPA."
              lignes={takeovers.map((o) => [
                o.id,
                [
                  quand(o.createdAt),
                  o.territory,
                  o.side === 'attacker' ? 'Attaquant' : 'Défenseur',
                  o.other,
                  tycoons(o.offerAmount),
                  ISSUES_OPA[o.status] ?? o.status,
                ],
              ])}
            />
          </Details>
          <Details titre="Connexions (20 dernières)">
            <Table
              colonnes={[['Quand'], ['Empreinte IP'], ['Empreinte navigateur']]}
              vide="Aucune connexion notée (le sel IP_SALT manquait, ou rien depuis)."
              lignes={logins.map((l) => [
                l.createdAt + l.ipHash,
                [
                  quand(l.createdAt),
                  <code key="ip" className="text-xs">
                    {l.ipHash}
                  </code>,
                  <code key="ua" className="text-xs">
                    {l.uaHash}
                  </code>,
                ],
              ])}
            />
          </Details>
          <Details titre="Journal d’audit">
            <Table
              colonnes={[['Quand'], ['Qui'], ['Action'], ['Avant → après'], ['Motif']]}
              vide="Aucune action de l’équipe sur ce compte."
              lignes={audit.map((l) => [
                l.id,
                [
                  quand(l.createdAt),
                  l.actor,
                  ACTIONS_AUDIT[l.action] ?? l.action,
                  <span key="v" className="text-xs">
                    {valeurs(l.before)} → {valeurs(l.after)}
                  </span>,
                  l.reason ?? '—',
                ],
              ])}
            />
          </Details>
        </div>
      </Section>
    </div>
  );
}

function Details({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer rounded-lg px-1 py-2 font-semibold marker:text-ardoise hover:text-encre">
        {titre}
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

type IdAction = 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'role' | 'adjust' | 'reset';
type Cible = FicheJoueurReponse['player'];

const ACTIONS: Record<IdAction, { libelle: string; effet: (p: Cible) => string; danger?: boolean }> = {
  suspend: { libelle: 'Suspendre', effet: () => 'Il garde la lecture mais ne peut plus agir. Il voit le motif.' },
  unsuspend: { libelle: 'Lever la suspension', effet: () => 'Il retrouve toutes ses actions tout de suite.' },
  ban: {
    libelle: 'Bannir',
    danger: true,
    effet: (p) => `${p.pseudo} est déconnecté et ne peut plus revenir. Ses communes restent à son nom.`,
  },
  unban: { libelle: 'Lever le bannissement', effet: () => 'Il peut de nouveau se connecter.' },
  role: {
    libelle: 'Changer le grade',
    effet: () => 'Modérateur : il voit le dashboard, prend des notes, suspend. Admin : il peut tout faire.',
  },
  adjust: {
    libelle: 'Ajuster le solde',
    effet: () => 'Positif : on ajoute. Négatif : on retire. Écrit dans ses transactions.',
  },
  reset: {
    libelle: 'Reset partiel',
    danger: true,
    effet: (p) =>
      `Ses ${entier(p.territories)} communes, leurs bâtiments et ses OPA en cours partent. Revenus en attente versés, argent gardé. Sans retour.`,
  },
};

const DUREES: [number, string][] = [
  [1, '1 heure'],
  [6, '6 heures'],
  [24, '24 heures'],
  [72, '3 jours'],
  [168, '7 jours'],
  [720, '30 jours'],
];

function Actions({ p, grade }: { p: Cible; grade: Grade }) {
  const [ouverte, setOuverte] = useState<IdAction | null>(null);
  const liste: IdAction[] = [
    p.suspendedUntil === null ? 'suspend' : 'unsuspend',
    ...(grade === 'admin' ? ([p.status === 'banned' ? 'unban' : 'ban', 'role', 'adjust', 'reset'] as const) : []),
  ];
  return (
    <Section titre="Actions">
      <div className="flex flex-wrap gap-2">
        {liste.map((a) => (
          <button
            key={a}
            type="button"
            aria-expanded={ouverte === a}
            onClick={() => setOuverte(ouverte === a ? null : a)}
            className={`${boutonSecondaire} ${ouverte === a ? 'bg-brume' : ''} ${ACTIONS[a].danger ? 'text-danger' : ''}`}
          >
            {ACTIONS[a].libelle}
          </button>
        ))}
      </div>
      {ouverte && <FormAction key={ouverte} action={ouverte} p={p} onFini={() => setOuverte(null)} />}
    </Section>
  );
}

/** Le formulaire est l'étape de confirmation : effet écrit en clair, motif obligatoire, bouton qui dit l'action. */
function FormAction({ action, p, onFini }: { action: IdAction; p: Cible; onFini: () => void }) {
  const envoi = useActionAdmin();
  const [motif, setMotif] = useState('');
  const [heures, setHeures] = useState(24);
  const [role, setRole] = useState<Role>(p.role);
  const [devise, setDevise] = useState<'cash' | 'gems'>('cash');
  const [somme, setSomme] = useState('');
  const n = Number(somme);
  const sommeOk = action !== 'adjust' || (somme.trim() !== '' && Number.isInteger(n) && n !== 0);
  const pret = motif.trim().length >= 3 && sommeOk && !(action === 'role' && role === p.role);
  const { libelle, effet, danger } = ACTIONS[action];

  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (!pret) return;
    const reason = motif.trim();
    const corps =
      action === 'suspend'
        ? { hours: heures, reason }
        : action === 'role'
          ? { role, reason }
          : action === 'adjust'
            ? { currency: devise, amount: n, reason }
            : { reason };
    envoi.mutate(
      { methode: action === 'role' ? 'PUT' : 'POST', url: `players/${p.id}/${action}`, corps },
      { onSuccess: onFini },
    );
  };

  return (
    <form
      onSubmit={valider}
      onKeyDown={(e) => e.key === 'Escape' && !envoi.isPending && onFini()}
      className="mt-3 flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4"
    >
      <p className="font-semibold">
        {libelle} : {p.pseudo}
      </p>
      <p className="text-sm text-ardoise">{effet(p)}</p>
      {action === 'suspend' && (
        <label className="flex flex-col gap-1 text-sm font-semibold text-ardoise">
          Durée
          <select value={heures} onChange={(e) => setHeures(Number(e.target.value))} className={champ}>
            {DUREES.map(([h, texte]) => (
              <option key={h} value={h}>
                {texte}
              </option>
            ))}
          </select>
        </label>
      )}
      {action === 'role' && (
        <label className="flex flex-col gap-1 text-sm font-semibold text-ardoise">
          Nouveau grade
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={champ}>
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLES[r]}
              </option>
            ))}
          </select>
        </label>
      )}
      {action === 'adjust' && (
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-ardoise">
            Montant (− pour retirer)
            <input
              inputMode="numeric"
              value={somme}
              onChange={(e) => setSomme(e.target.value.replace(/[^\d-]/g, ''))}
              placeholder="ex. 5000 ou -200"
              className={champ}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ardoise">
            Devise
            <select value={devise} onChange={(e) => setDevise(e.target.value as 'cash' | 'gems')} className={champ}>
              <option value="cash">₮</option>
              <option value="gems">Gemmes</option>
            </select>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold text-ardoise">
        Motif (gardé dans le journal d’audit)
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          maxLength={500}
          placeholder="Pourquoi ?"
          className={champ}
        />
      </label>
      {envoi.error && (
        <p role="alert" className="text-sm text-danger">
          {messageErreur(envoi.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFini} disabled={envoi.isPending} className={boutonSecondaire}>
          Annuler
        </button>
        <button
          type="submit"
          disabled={!pret || envoi.isPending}
          className={
            danger ? 'h-10 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-50' : 'relief h-10 px-4'
          }
        >
          {envoi.isPending ? 'Envoi…' : libelle}
        </button>
      </div>
    </form>
  );
}

function Notes({ id, notes }: { id: number; notes: FicheJoueurReponse['notes'] }) {
  const envoi = useActionAdmin();
  const [texte, setTexte] = useState('');
  const [edition, setEdition] = useState<{ id: number; body: string } | null>(null);
  const [aEffacer, setAEffacer] = useState<number | null>(null);

  const ajouter = (e: FormEvent) => {
    e.preventDefault();
    if (!texte.trim()) return;
    envoi.mutate(
      { methode: 'POST', url: `players/${id}/notes`, corps: { body: texte.trim() } },
      { onSuccess: () => setTexte('') },
    );
  };

  return (
    <Section titre={`Notes de l’équipe (${notes.length})`}>
      <form onSubmit={ajouter} className="flex flex-col gap-2 sm:flex-row">
        <textarea
          aria-label="Nouvelle note"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Visible par l’équipe seulement"
          className={`${champ} h-auto flex-1 py-2`}
        />
        <button type="submit" disabled={!texte.trim() || envoi.isPending} className="relief h-10 self-start px-4">
          Ajouter
        </button>
      </form>
      {envoi.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {messageErreur(envoi.error)}
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id} className="panneau px-4 py-3">
            {edition?.id === n.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  envoi.mutate(
                    { methode: 'PATCH', url: `notes/${n.id}`, corps: { body: edition.body.trim() } },
                    { onSuccess: () => setEdition(null) },
                  );
                }}
                className="flex flex-col gap-2"
              >
                <textarea
                  aria-label="Modifier la note"
                  value={edition.body}
                  onChange={(e) => setEdition({ id: n.id, body: e.target.value })}
                  maxLength={2000}
                  rows={3}
                  className={`${champ} h-auto py-2`}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEdition(null)} className={`${petitBouton} text-ardoise`}>
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!edition.body.trim() || envoi.isPending}
                    className={`${petitBouton} bg-brume`}
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ardoise">
                  <span>
                    {n.author ?? 'Compte supprimé'} · {quand(n.createdAt)}
                    {n.updatedAt > n.createdAt && ' · modifiée'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEdition({ id: n.id, body: n.body })}
                    className="font-semibold hover:text-encre"
                  >
                    Modifier
                  </button>
                  {aEffacer === n.id ? (
                    <button
                      type="button"
                      onClick={() =>
                        envoi.mutate(
                          { methode: 'DELETE', url: `notes/${n.id}` },
                          { onSuccess: () => setAEffacer(null) },
                        )
                      }
                      className="font-semibold text-danger"
                    >
                      Confirmer l’effacement
                    </button>
                  ) : (
                    <button type="button" onClick={() => setAEffacer(n.id)} className="font-semibold hover:text-danger">
                      Effacer
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
