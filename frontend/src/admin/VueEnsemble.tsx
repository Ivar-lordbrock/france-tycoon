import type { VueEnsembleReponse } from '@france-tycoon/shared';
import type { ReactNode } from 'react';
import { useVueEnsemble } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { ilYa } from '../panels/notifications-texte.ts';

const TACHES: Record<string, string> = {
  'resolve-takeovers': 'Résolution des OPA',
  'warn-inactive': 'Avertissement d’inactivité (11 j)',
  'release-inactive': 'Libération des inactifs (14 j)',
  leaderboard: 'Classement',
};

const ETATS = {
  ok: { libelle: 'OK', classe: 'bg-succes/15 text-succes' },
  running: { libelle: 'En cours', classe: 'bg-alerte/15 text-alerte' },
  error: { libelle: 'Erreur', classe: 'bg-danger/15 text-danger' },
} as const;

/** « 137 Mo », « 12,4 Go ». */
export function taille(octets: number): string {
  const go = octets >= 1e9;
  return new Intl.NumberFormat('fr-FR', {
    style: 'unit',
    unit: go ? 'gigabyte' : 'megabyte',
    maximumFractionDigits: go ? 1 : 0,
  }).format(octets / (go ? 1e9 : 1e6));
}

/** Vue d'ensemble : joueurs, communes, économie, OPA et santé du serveur (lecture seule, tous grades). */
export function VueEnsemble() {
  const { data, error, isPending, isFetching, refetch } = useVueEnsemble();

  if (isPending) return <p className="mt-4 text-ardoise">Chargement…</p>;
  if (error)
    return (
      <p role="alert" className="mt-4 text-danger">
        {messageErreur(error)}
      </p>
    );

  const { players, territories, economy, takeovers, system, now } = data;
  return (
    <div className="mt-2 flex flex-col gap-8 [font-variant-numeric:tabular-nums]">
      <div className="flex items-center gap-3 text-sm text-ardoise">
        <span>Chiffres {ilYa(now, Math.floor(Date.now() / 1000))}, relus chaque minute.</span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-full bg-brume px-3 py-1.5 font-semibold text-encre hover:bg-[#3a3e45] disabled:text-ardoise"
        >
          {isFetching ? 'Lecture…' : 'Rafraîchir'}
        </button>
      </div>

      <Section titre="Joueurs">
        <dl className="panneau grid grid-cols-2 divide-encre/10 sm:grid-cols-4 sm:divide-x">
          <Chiffre libelle="Inscrits">{entier(players.total)}</Chiffre>
          <Chiffre libelle="Actifs 24 h">{entier(players.active24h)}</Chiffre>
          <Chiffre libelle="Actifs 7 j">{entier(players.active7d)}</Chiffre>
          <Chiffre libelle="Actifs 14 j">{entier(players.active14d)}</Chiffre>
        </dl>
      </Section>

      <Section titre="Communes possédées">
        <div className="panneau flex flex-col gap-4 p-4">
          <Zone nom="Métropole" communes={territories.metropole} />
          <Zone nom="DROM-COM" communes={territories.outreMer} />
        </div>
      </Section>

      <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
        <Section titre="Économie">
          <dl className="panneau grid grid-cols-1 divide-y divide-encre/10">
            <Chiffre libelle="₮ sur les comptes des joueurs">{tycoons(economy.cash)}</Chiffre>
            <Chiffre libelle="Gemmes sur les comptes">{entier(economy.gems)}</Chiffre>
            <Chiffre libelle="Revenus passifs, tous joueurs">{tycoons(economy.incomePerHour)} / h</Chiffre>
          </dl>
        </Section>
        <Section titre="OPA">
          <dl className="panneau grid grid-cols-1 divide-y divide-encre/10">
            <Chiffre libelle="En cours (24 h)">{entier(takeovers.active)}</Chiffre>
            <Chiffre libelle="Terminées">{entier(takeovers.finished)}</Chiffre>
          </dl>
        </Section>
      </div>

      <Section titre="Santé du serveur">
        <div className="panneau overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-ardoise">
              <tr className="border-b border-encre/10">
                <th className="px-4 py-2.5 font-semibold">Tâche planifiée</th>
                <th className="px-4 py-2.5 font-semibold">État</th>
                <th className="px-4 py-2.5 text-right font-semibold">Dernier passage</th>
              </tr>
            </thead>
            <tbody>
              {system.jobs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-ardoise">
                    Aucune tâche n’a encore tourné.
                  </td>
                </tr>
              )}
              {system.jobs.map((t) => (
                <tr key={t.name} className="border-b border-encre/10 last:border-0">
                  <td className="px-4 py-2.5">{TACHES[t.name] ?? t.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ETATS[t.status].classe}`}>
                      {ETATS[t.status].libelle}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-ardoise">{ilYa(t.startedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ardoise">
          Base de données : <span className="text-encre">{taille(system.databaseBytes)}</span>
          {system.diskFreeBytes !== null && (
            <>
              {' '}
              · Disque libre : <span className="text-encre">{taille(system.diskFreeBytes)}</span>
            </>
          )}
          . Les revenus se calculent à chaque action des joueurs, sans tâche planifiée.
        </p>
      </Section>
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-lg font-bold">{titre}</h2>
      {children}
    </section>
  );
}

function Chiffre({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <dt className="text-sm text-ardoise">{libelle}</dt>
      <dd className="text-xl font-bold">{children}</dd>
    </div>
  );
}

/** Une ligne par zone : possédées sur le total, et la barre qui le montre. */
function Zone({ nom, communes }: { nom: string; communes: VueEnsembleReponse['territories']['metropole'] }) {
  const part = communes.total > 0 ? communes.owned / communes.total : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{nom}</span>
        <span className="text-ardoise">
          <span className="font-bold text-encre">{entier(communes.owned)}</span> sur {entier(communes.total)} ·{' '}
          {new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(part)} · libres :{' '}
          {entier(communes.total - communes.owned)}
        </span>
      </div>
      <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-brume">
        {/* Au moins un trait visible dès qu'une commune est prise. */}
        <div
          className="h-full rounded-full bg-surligneur"
          style={{ width: part > 0 ? `max(${part * 100}%, 4px)` : 0 }}
        />
      </div>
    </div>
  );
}
