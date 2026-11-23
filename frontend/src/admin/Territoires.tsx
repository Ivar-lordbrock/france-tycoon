import type { Grade, LigneCommuneAdmin, LigneOpaAdmin, StatutOpa } from '@france-tycoon/shared';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { type FiltresCommunes, useActionAdmin, useOpaAdmin, useRechercheCommunes } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { boutonSecondaire, petitBouton } from '../panels/Confirmer.tsx';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { champ, ISSUES_OPA, Pastille, quand, Table } from './Joueurs.tsx';
import { Section } from './VueEnsemble.tsx';

const FILTRES: [FiltresCommunes['filter'], string][] = [
  ['owned', 'Possédées'],
  ['free', 'Libres'],
  ['forced', 'Prix forcé'],
  ['takeover', 'OPA en cours'],
  ['', 'Toutes'],
];
const STATUTS_OPA: StatutOpa[] = ['pending', 'succeeded', 'accepted', 'defended', 'cancelled', 'voided'];

/** Vue Territoires et OPA. Toute l'équipe lit ; seuls les admins voient les boutons (le serveur vérifie). */
export function Territoires({ grade }: { grade: Grade }) {
  const admin = grade === 'admin';
  return (
    <div className="mt-4 flex flex-col gap-8">
      <Communes admin={admin} />
      <Opa admin={admin} />
    </div>
  );
}

function Communes({ admin }: { admin: boolean }) {
  const [filtres, setFiltres] = useState<FiltresCommunes>({ q: '', filter: 'owned' });
  const [saisie, setSaisie] = useState('');
  const [choisie, setChoisie] = useState<LigneCommuneAdmin | null>(null);
  const { data, error, isPending, isFetching } = useRechercheCommunes(filtres);
  const chercher = (e: FormEvent) => {
    e.preventDefault();
    setFiltres({ ...filtres, q: saisie.trim() });
  };

  return (
    <Section titre="Communes">
      <div className="flex flex-col gap-4">
        <search>
          <form onSubmit={chercher} className="flex flex-wrap gap-2">
            <input
              type="search"
              aria-label="Chercher une commune"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Nom ou code INSEE"
              maxLength={100}
              className={`${champ} flex-1 basis-64`}
            />
            <select
              aria-label="Filtre"
              value={filtres.filter}
              onChange={(e) => setFiltres({ ...filtres, filter: e.target.value as FiltresCommunes['filter'] })}
              className={champ}
            >
              {FILTRES.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
            <button type="submit" className="relief h-10 px-4">
              Chercher
            </button>
          </form>
        </search>

        {choisie && <FormPrix key={choisie.insee} c={choisie} onFini={() => setChoisie(null)} />}

        {error ? (
          <p role="alert" className="text-danger">
            {messageErreur(error)}
          </p>
        ) : isPending ? (
          <p className="text-ardoise">Chargement…</p>
        ) : (
          <>
            <Table
              colonnes={[
                ['Commune'],
                ['Propriétaire'],
                ['Habitants', true],
                ['Prix d’achat', true],
                ...(admin ? ([['']] as [string][]) : []),
              ]}
              vide="Aucune commune ne correspond."
              attente={isFetching}
              lignes={data.territories.map((c) => [
                c.insee,
                [
                  <span key="c" className="flex flex-col">
                    <span className="font-semibold">
                      {c.name}
                      {c.isCapital && <span className="ml-1.5 text-xs font-normal text-ardoise">capitale</span>}
                    </span>
                    <span className="text-xs whitespace-nowrap text-ardoise tabular-nums">
                      {c.insee} · dép. {c.department}
                    </span>
                  </span>,
                  c.owner ? (
                    <span key="p" className="flex flex-wrap items-center gap-1.5">
                      {c.owner.pseudo}
                      {c.takeoverPending && <Pastille classe="bg-alerte/15 text-alerte">OPA</Pastille>}
                    </span>
                  ) : (
                    <span key="p" className="text-ardoise">
                      Libre
                    </span>
                  ),
                  entier(c.population),
                  <Prix key="x" c={c} />,
                  ...(admin
                    ? [
                        <button
                          key="a"
                          type="button"
                          onClick={() => setChoisie(c)}
                          className={`${petitBouton} border border-encre/15 hover:bg-brume`}
                        >
                          Prix
                        </button>,
                      ]
                    : []),
                ],
              ])}
            />
            {data.territories.length === 50 && (
              <p className="text-sm text-ardoise">Seules les 50 plus peuplées s’affichent : affine la recherche.</p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

/** Prix payé par le prochain acheteur ; un prix forcé montre aussi le calcul auto et son motif. */
function Prix({ c }: { c: LigneCommuneAdmin }) {
  if (c.forcedPrice === null) return tycoons(c.baseValue);
  return (
    <span className="flex flex-col items-end" title={c.forcedReason ?? undefined}>
      <span className="flex items-center gap-1.5">
        <Pastille classe="bg-surligneur/25 text-encre">forcé</Pastille>
        {tycoons(c.forcedPrice)}
      </span>
      <span className="text-xs text-ardoise">auto : {tycoons(c.baseValue)}</span>
    </span>
  );
}

/** Forcer le prix d'achat, ou revenir au calcul auto. Motif obligatoire. */
function FormPrix({ c, onFini }: { c: LigneCommuneAdmin; onFini: () => void }) {
  const envoi = useActionAdmin();
  const [motif, setMotif] = useState('');
  const [somme, setSomme] = useState(c.forcedPrice === null ? '' : String(c.forcedPrice));
  const n = Number(somme);
  const motifOk = motif.trim().length >= 3;
  const sommeOk = somme !== '' && Number.isInteger(n) && n > 0 && n !== c.forcedPrice;

  const envoyer = (price: number | null) =>
    envoi.mutate(
      { methode: 'PUT', url: `territories/${c.insee}/price`, corps: { price, reason: motif.trim() } },
      { onSuccess: onFini },
    );
  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (motifOk && sommeOk) envoyer(n);
  };

  return (
    <Cadre onSubmit={valider} onFini={onFini} occupe={envoi.isPending} titre={`Prix d’achat : ${c.name} (${c.insee})`}>
      <p className="text-sm text-ardoise">
        Calcul auto : {tycoons(c.baseValue)}. Le prochain acheteur paiera le prix que tu fixes, tant que tu ne reviens
        pas au calcul auto.
        {c.owner && ` Aujourd’hui la commune est à ${c.owner.pseudo} : le prix servira quand elle sera libre.`}
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ardoise">
        Prix forcé (₮)
        <input
          inputMode="numeric"
          value={somme}
          onChange={(e) => setSomme(e.target.value.replace(/\D/g, ''))}
          placeholder={`ex. ${c.baseValue}`}
          className={`${champ} tabular-nums`}
        />
      </label>
      <ChampMotif motif={motif} setMotif={setMotif} />
      <Erreur erreur={envoi.error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onFini} disabled={envoi.isPending} className={boutonSecondaire}>
          Annuler
        </button>
        {c.forcedPrice !== null && (
          <button
            type="button"
            onClick={() => envoyer(null)}
            disabled={!motifOk || envoi.isPending}
            className={boutonSecondaire}
          >
            Revenir au calcul auto
          </button>
        )}
        <button type="submit" disabled={!motifOk || !sommeOk || envoi.isPending} className="relief h-10 px-4">
          {envoi.isPending ? 'Envoi…' : 'Forcer le prix'}
        </button>
      </div>
    </Cadre>
  );
}

type ActionOpa = 'force' | 'cancel';

function Opa({ admin }: { admin: boolean }) {
  const [statut, setStatut] = useState<StatutOpa>('pending');
  const [choix, setChoix] = useState<{ o: LigneOpaAdmin; action: ActionOpa } | null>(null);
  const { data, error, isPending, isFetching } = useOpaAdmin(statut);
  const enCours = statut === 'pending';

  return (
    <Section titre="OPA">
      <div className="flex flex-col gap-4">
        <select
          aria-label="Statut des OPA"
          value={statut}
          onChange={(e) => {
            setStatut(e.target.value as StatutOpa);
            setChoix(null);
          }}
          className={`${champ} self-start`}
        >
          {STATUTS_OPA.map((s) => (
            <option key={s} value={s}>
              {ISSUES_OPA[s]}
            </option>
          ))}
        </select>

        {choix && <FormOpa key={`${choix.o.id}-${choix.action}`} {...choix} onFini={() => setChoix(null)} />}

        {error ? (
          <p role="alert" className="text-danger">
            {messageErreur(error)}
          </p>
        ) : isPending ? (
          <p className="text-ardoise">Chargement…</p>
        ) : (
          <Table
            colonnes={[
              ['Commune'],
              ['Attaquant → défenseur'],
              ['Offre', true],
              [enCours ? 'Fin des 24 h' : 'Terminée', true],
              ...(admin && enCours ? ([['']] as [string][]) : []),
            ]}
            vide={enCours ? 'Aucune OPA en cours.' : 'Aucune OPA avec ce statut.'}
            attente={isFetching}
            lignes={data.takeovers.map((o) => [
              o.id,
              [
                <span key="c" className="flex flex-col">
                  <span className="font-semibold">{o.territory}</span>
                  <span className="text-xs text-ardoise tabular-nums">{o.insee}</span>
                </span>,
                `${o.attacker} → ${o.defender}`,
                tycoons(o.offerAmount),
                <span key="q" className="whitespace-nowrap">
                  {quand(enCours ? o.expiresAt : (o.resolvedAt ?? o.expiresAt))}
                </span>,
                ...(admin && enCours
                  ? [
                      <span key="a" className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setChoix({ o, action: 'force' })}
                          className={`${petitBouton} border border-encre/15 hover:bg-brume`}
                        >
                          Forcer
                        </button>
                        <button
                          type="button"
                          onClick={() => setChoix({ o, action: 'cancel' })}
                          className={`${petitBouton} border border-encre/15 text-danger hover:bg-brume`}
                        >
                          Annuler
                        </button>
                      </span>,
                    ]
                  : []),
              ],
            ])}
          />
        )}
      </div>
    </Section>
  );
}

const ACTIONS_OPA: Record<ActionOpa, { libelle: string; effet: (o: LigneOpaAdmin) => string }> = {
  force: {
    libelle: 'Forcer l’OPA',
    effet: (o) =>
      `${o.territory} passe tout de suite à ${o.attacker}, avec ses bâtiments. ${o.defender} reçoit l’offre de ${tycoons(o.offerAmount)}, comme au bout des 24 h.`,
  },
  cancel: {
    libelle: 'Annuler l’OPA',
    effet: (o) =>
      `L’OPA s’arrête. ${o.attacker} récupère toute son offre (${tycoons(o.offerAmount)}). ${o.territory} reste à ${o.defender}.`,
  },
};

function FormOpa({ o, action, onFini }: { o: LigneOpaAdmin; action: ActionOpa; onFini: () => void }) {
  const envoi = useActionAdmin();
  const [motif, setMotif] = useState('');
  const pret = motif.trim().length >= 3;
  const { libelle, effet } = ACTIONS_OPA[action];
  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (pret)
      envoi.mutate(
        { methode: 'POST', url: `takeovers/${o.id}/${action}`, corps: { reason: motif.trim() } },
        { onSuccess: onFini },
      );
  };

  return (
    <Cadre onSubmit={valider} onFini={onFini} occupe={envoi.isPending} titre={`${libelle} : ${o.territory}`}>
      <p className="text-sm text-ardoise">{effet(o)}</p>
      <ChampMotif motif={motif} setMotif={setMotif} />
      <Erreur erreur={envoi.error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFini} disabled={envoi.isPending} className={boutonSecondaire}>
          Retour
        </button>
        <button
          type="submit"
          disabled={!pret || envoi.isPending}
          className="h-10 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-50"
        >
          {envoi.isPending ? 'Envoi…' : libelle}
        </button>
      </div>
    </Cadre>
  );
}

/** Le formulaire de confirmation, mis sous les yeux à l'ouverture ; Échap le ferme. */
function Cadre({
  titre,
  onSubmit,
  onFini,
  occupe,
  children,
}: {
  titre: string;
  onSubmit: (e: FormEvent) => void;
  onFini: () => void;
  occupe: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ref.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      ref={ref}
      onSubmit={onSubmit}
      onKeyDown={(e) => e.key === 'Escape' && !occupe && onFini()}
      className="flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4"
    >
      <p className="font-semibold">{titre}</p>
      {children}
    </form>
  );
}

function ChampMotif({ motif, setMotif }: { motif: string; setMotif: (m: string) => void }) {
  return (
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
  );
}

function Erreur({ erreur }: { erreur: Error | null }) {
  return erreur ? (
    <p role="alert" className="text-sm text-danger">
      {messageErreur(erreur)}
    </p>
  ) : null;
}
