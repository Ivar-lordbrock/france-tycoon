import { type MoiReponse, PSEUDO_MAX, pseudoSchema } from '@france-tycoon/shared';
import { type FormEvent, useId, useState } from 'react';
import { useConfigConnexion, useConnexion, useDeconnexion, useModifierProfil, useMoi } from '../api/compte.ts';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { MesTerritoires } from '../panels/MesTerritoires.tsx';
import { BoutonGoogle } from './BoutonGoogle.tsx';

/** Coin du joueur : connexion, ou barre du haut (cash, gemmes, revenu) et profil. */
export function Compte() {
  const { data: moi, isPending, isError } = useMoi();
  if (isPending) return null;
  if (isError) {
    return <p className="panneau pointer-events-auto p-3 text-sm text-ardoise">Serveur injoignable.</p>;
  }
  return moi ? <BarreJoueur moi={moi} /> : <Connexion />;
}

function Connexion() {
  const id = useId();
  const { data: config } = useConfigConnexion();
  const connexion = useConnexion();
  const [pseudo, setPseudo] = useState('');

  const entrer = (e: FormEvent) => {
    e.preventDefault();
    if (pseudo.trim()) connexion.mutate({ pseudo: pseudo.trim() });
  };

  return (
    <section aria-labelledby={`${id}-titre`} className="panneau pointer-events-auto p-4">
      <h2 id={`${id}-titre`} className="font-bold">
        Connecte-toi pour jouer
      </h2>
      <p className="mt-1 text-sm text-ardoise">30 000 ₮ offerts pour acheter ta première commune.</p>

      <div className="mt-3 flex flex-col gap-3">
        {config?.googleClientId && (
          <BoutonGoogle clientId={config.googleClientId} onJeton={(jeton) => connexion.mutate({ google: jeton })} />
        )}
        {config?.devLogin && (
          <form onSubmit={entrer} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-pseudo`} className="text-xs font-semibold text-ardoise">
              Compte de test (local, sans Google)
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-pseudo`}
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                maxLength={PSEUDO_MAX}
                placeholder="Ton pseudo"
                autoComplete="nickname"
                className="h-10 min-w-0 flex-1 rounded-md border border-encre/15 px-2.5 outline-none focus:border-encre focus:ring-2 focus:ring-surligneur"
              />
              <button
                type="submit"
                disabled={connexion.isPending || !pseudo.trim()}
                className="h-10 rounded-md bg-encre px-3 font-semibold text-white disabled:opacity-50"
              >
                Entrer
              </button>
            </div>
          </form>
        )}
        {config && !config.googleClientId && !config.devLogin && (
          <p className="text-sm text-ardoise">Connexion pas encore configurée (voir docs/08-connexion-google.md).</p>
        )}
        {connexion.isError && (
          <p role="alert" className="text-sm text-red-700">
            {connexion.error.message}
          </p>
        )}
      </div>
    </section>
  );
}

function Avatar({ moi }: { moi: MoiReponse }) {
  const { avatarUrl, pseudo, markerColor } = moi.user;
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full" />;
  }
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ background: markerColor }}
      aria-hidden="true"
    >
      {pseudo.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Barre du haut : qui je suis, mon cash, mes gemmes, mon revenu par heure, mes territoires. */
function BarreJoueur({ moi }: { moi: MoiReponse }) {
  const [ouvert, setOuvert] = useState<'profil' | 'territoires' | null>(null);
  const id = useId();
  const basculer = (volet: 'profil' | 'territoires') => setOuvert((o) => (o === volet ? null : volet));

  return (
    <section aria-label="Mon compte" className="panneau pointer-events-auto">
      <button
        type="button"
        onClick={() => basculer('profil')}
        aria-expanded={ouvert === 'profil'}
        aria-controls={`${id}-profil`}
        className="flex w-full items-center gap-3 rounded-[10px] p-2.5 text-left hover:bg-brume/60"
      >
        <Avatar moi={moi} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate font-semibold">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: moi.user.markerColor }}
              aria-hidden="true"
            />
            {moi.user.pseudo}
          </span>
          <span className="block text-xs text-ardoise">
            {moi.territories.owned} / {moi.territories.max} territoires
          </span>
        </span>
      </button>
      <dl className="grid grid-cols-3 border-t border-encre/10 text-center">
        <div className="p-2">
          <dt className="text-xs text-ardoise">Cash</dt>
          <dd className="font-bold tabular-nums">{tycoons(moi.wallet.cash)}</dd>
        </div>
        <div className="border-x border-encre/10 p-2">
          <dt className="text-xs text-ardoise">Gemmes</dt>
          <dd className="font-bold tabular-nums">{entier(moi.wallet.gems)} 💎</dd>
        </div>
        <div className="p-2">
          <dt className="text-xs text-ardoise">Revenu</dt>
          <dd className="font-bold tabular-nums">{tycoons(moi.incomePerHour)}/h</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => basculer('territoires')}
        aria-expanded={ouvert === 'territoires'}
        aria-controls={`${id}-territoires`}
        className={`flex w-full items-center justify-between gap-2 border-t border-encre/10 px-3 py-2 text-sm font-semibold hover:bg-brume/60 ${ouvert ? '' : 'rounded-b-[10px]'}`}
      >
        Mes territoires
        <span className="flex items-center gap-1.5 font-normal text-ardoise tabular-nums">
          {moi.territories.owned} / {moi.territories.max}
          <svg
            viewBox="0 0 20 20"
            className={`size-4 stroke-current stroke-2 transition-transform motion-reduce:transition-none ${ouvert === 'territoires' ? 'rotate-180' : ''}`}
            fill="none"
            aria-hidden="true"
          >
            <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {ouvert === 'territoires' && <MesTerritoires id={`${id}-territoires`} onChoisi={() => setOuvert(null)} />}
      {ouvert === 'profil' && <Profil id={`${id}-profil`} moi={moi} />}
    </section>
  );
}

function Profil({ id, moi }: { id: string; moi: MoiReponse }) {
  const modifier = useModifierProfil();
  const deconnexion = useDeconnexion();
  const [pseudo, setPseudo] = useState(moi.user.pseudo);
  const [couleur, setCouleur] = useState(moi.user.markerColor);
  const verifie = pseudoSchema.safeParse(pseudo);
  const change = pseudo.trim() !== moi.user.pseudo || couleur !== moi.user.markerColor;

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    if (!verifie.success || !change) return;
    modifier.mutate({
      ...(verifie.data !== moi.user.pseudo ? { pseudo: verifie.data } : {}),
      ...(couleur !== moi.user.markerColor ? { markerColor: couleur } : {}),
    });
  };

  return (
    <form id={id} onSubmit={enregistrer} className="flex flex-col gap-3 border-t border-encre/10 p-3">
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-ardoise">
          Pseudo
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            maxLength={PSEUDO_MAX}
            aria-invalid={!verifie.success}
            className="h-10 rounded-md border border-encre/15 px-2.5 text-base font-normal text-encre outline-none focus:border-encre focus:ring-2 focus:ring-surligneur"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ardoise">
          Couleur
          <input
            type="color"
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            className="h-10 w-12 cursor-pointer rounded-md border border-encre/15 bg-white p-1"
          />
        </label>
      </div>
      {!verifie.success && <p className="text-sm text-red-700">3 à 24 lettres, chiffres, espaces, . _ ou -.</p>}
      {modifier.isError && (
        <p role="alert" className="text-sm text-red-700">
          {modifier.error.message}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={() => deconnexion.mutate()}
          disabled={deconnexion.isPending}
          className="h-10 rounded-md px-3 text-sm font-semibold text-ardoise hover:bg-brume hover:text-encre"
        >
          Se déconnecter
        </button>
        <button
          type="submit"
          disabled={!change || !verifie.success || modifier.isPending}
          className="h-10 rounded-md bg-encre px-3 font-semibold text-white disabled:opacity-50"
        >
          {modifier.isSuccess && !change ? 'Enregistré' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
