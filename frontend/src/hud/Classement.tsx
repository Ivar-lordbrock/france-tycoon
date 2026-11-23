import { CLASSEMENT_TOUTES_LES_S, type LigneClassement, type PorteeClassement, REGIONS } from '@france-tycoon/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { useClassement, useProfil } from '../api/classement.ts';
import { suivre } from '../api/quetes.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { allerALaCommune } from '../panels/aller-a-la-commune.ts';
import { nomRang, place } from '../panels/classement-texte.ts';
import { tycoons } from '../panels/fiche-texte.ts';
import { ilYa } from '../panels/notifications-texte.ts';

const communes = (n: number) => `${n} commune${n > 1 ? 's' : ''}`;

/** Le classement par patrimoine (France, métropole, outre-mer ou une région) ; un clic ouvre le profil du joueur. */
export function Classement({ id, onChoisi }: { id: string; onChoisi: () => void }) {
  const [portee, setPortee] = useState<PorteeClassement>('national');
  const [joueur, setJoueur] = useState<string | null>(null);
  const client = useQueryClient();

  // « Classement vu » : quête « Veille » et tutoriel.
  useEffect(() => suivre(client, 'leaderboard_viewed', portee), [client, portee]);

  return (
    <div id={id} className="border-t border-encre/10">
      {joueur ? (
        <ProfilJoueur pseudo={joueur} onRetour={() => setJoueur(null)} onChoisi={onChoisi} />
      ) : (
        <>
          <label className="flex items-center gap-2 px-3 pt-2 text-xs font-semibold text-ardoise">
            Où
            <select
              value={portee}
              onChange={(e) => setPortee(e.target.value as PorteeClassement)}
              className="h-9 min-w-0 flex-1 rounded-md border border-encre/15 bg-white px-2 text-sm font-normal text-encre outline-none focus:border-encre focus:ring-2 focus:ring-surligneur"
            >
              <option value="national">France entière</option>
              <option value="metropole">Métropole</option>
              <option value="outre_mer">Outre-mer</option>
              <optgroup label="Par région">
                {REGIONS.map((r) => (
                  <option key={r.code} value={`region:${r.code}`}>
                    {r.nom}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <ListeClassement portee={portee} onJoueur={setJoueur} />
        </>
      )}
    </div>
  );
}

function ListeClassement({ portee, onJoueur }: { portee: PorteeClassement; onJoueur: (pseudo: string) => void }) {
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useClassement(portee);
  const maintenant = useMaintenant(30_000);

  if (isPending) return <p className="p-3 text-sm text-ardoise">Chargement…</p>;
  if (isError) return <p className="p-3 text-sm text-ardoise">Classement indisponible : le serveur ne répond pas.</p>;

  const lignes = data.pages.flatMap((p) => p.players);
  const me = data.pages[0]?.me ?? null;
  const updatedAt = data.pages[0]?.updatedAt ?? null;
  const ligne = (l: LigneClassement) => (
    <li key={l.rank}>
      <button
        type="button"
        onClick={() => onJoueur(l.pseudo)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brume/60 ${l.pseudo === me?.pseudo ? 'bg-surligneur/30' : ''}`}
      >
        <span className="w-7 shrink-0 text-right text-ardoise tabular-nums">{l.rank}</span>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.markerColor }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{l.pseudo}</span>
          <span className="block text-xs text-ardoise">
            {nomRang(l.rankLevel)} · {communes(l.territories)}
          </span>
        </span>
        <span className="shrink-0 tabular-nums">{tycoons(l.netWorth)}</span>
      </button>
    </li>
  );

  return (
    <>
      {lignes.length === 0 ? (
        <p className="p-3 text-sm text-ardoise">Personne ici pour l’instant : il faut y posséder une commune.</p>
      ) : (
        <ul className="mt-1 max-h-72 overflow-y-auto">
          {lignes.map(ligne)}
          {hasNextPage && (
            <li>
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full px-3 py-2 text-sm font-semibold text-ardoise hover:bg-brume/60 hover:text-encre disabled:opacity-50"
              >
                Voir plus
              </button>
            </li>
          )}
        </ul>
      )}
      {/* Ma ligne, si elle n'est pas encore dans les pages chargées. */}
      {me && me.rank > lignes.length && <ul className="border-t border-dashed border-encre/15">{ligne(me)}</ul>}
      <p className="border-t border-encre/10 px-3 py-2 text-xs text-ardoise">
        Patrimoine : cash et valeur des communes.{' '}
        {updatedAt === null
          ? 'Classement pas encore calculé.'
          : `Mis à jour ${ilYa(updatedAt, maintenant)} (toutes les ${CLASSEMENT_TOUTES_LES_S / 60} min).`}
      </p>
    </>
  );
}

function ProfilJoueur({ pseudo, onRetour, onChoisi }: { pseudo: string; onRetour: () => void; onChoisi: () => void }) {
  const { data, isPending, isError } = useProfil(pseudo);
  const client = useQueryClient();

  let contenu: ReactNode;
  if (isPending) contenu = <p className="p-3 text-sm text-ardoise">Chargement…</p>;
  else if (isError) contenu = <p className="p-3 text-sm text-ardoise">Profil introuvable.</p>;
  else {
    contenu = (
      <>
        <div className="px-3 pb-2">
          <p className="flex items-center gap-1.5 font-semibold">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: data.markerColor }}
              aria-hidden="true"
            />
            <span className="truncate">{data.pseudo}</span>
          </p>
          <p className="text-sm text-ardoise">
            {nomRang(data.rankLevel)} · {place(data.nationalRank)} en France
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-ardoise">Patrimoine</dt>
              <dd className="font-bold tabular-nums">{tycoons(data.netWorth)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ardoise">Joue depuis le</dt>
              <dd>
                {new Date(data.createdAt * 1000).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </div>
        <p className="border-t border-encre/10 px-3 pt-2 text-xs font-semibold text-ardoise">
          {communes(data.territories.length)}
        </p>
        <ul className="max-h-60 overflow-y-auto pb-1">
          {data.territories.map((t) => (
            <li key={t.insee}>
              <button
                type="button"
                onClick={() => {
                  onChoisi();
                  void allerALaCommune(client, t.insee, { zone: t.zone });
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-brume/60"
              >
                {t.name}
                {t.isCapital && <span className="text-ardoise"> · capitale</span>}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onRetour}
        className="px-3 py-2 text-sm font-semibold text-ardoise hover:text-encre"
      >
        ← Classement
      </button>
      {contenu}
    </>
  );
}
