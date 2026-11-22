import { type MoiReponse, PSEUDO_MAX, pseudoSchema } from '@france-tycoon/shared';
import { type FormEvent, useId, useState } from 'react';
import { useCashEnDirect } from '../api/batiments.ts';
import { messageErreur } from '../api/client.ts';
import {
  useConfigConnexion,
  useConnexion,
  useDeconnexion,
  useModifierProfil,
  useMoi,
  useSupprimerCompte,
} from '../api/compte.ts';
import { useFluxDirect } from '../api/direct.ts';
import { useEncaisser } from '../api/quetes.ts';
import { CentreMessages } from '../hud/CentreMessages.tsx';
import { ChantierEnCours } from '../hud/ChantierEnCours.tsx';
import { Classement } from '../hud/Classement.tsx';
import { MesOpa } from '../hud/MesOpa.tsx';
import { QuetesDuJour } from '../hud/QuetesDuJour.tsx';
import { ResumeRetour } from '../hud/ResumeRetour.tsx';
import { nomRang } from '../panels/classement-texte.ts';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { MesTerritoires } from '../panels/MesTerritoires.tsx';
import { BoutonGoogle } from './BoutonGoogle.tsx';
import { LiensInfos } from './LiensInfos.tsx';

/** Coin du joueur : connexion, ou barre du haut (cash, gemmes, revenu) et profil. */
export function Compte() {
  const { data: moi, isPending, isError } = useMoi();
  if (isPending) return null;
  if (isError) {
    return <p className="panneau pointer-events-auto p-3 text-sm text-ardoise">Serveur injoignable.</p>;
  }
  if (!moi) return <Connexion />;
  return (
    <>
      {/* Une clé par joueur : changer de compte rouvre le flux avec la bonne session. */}
      <FluxDirect key={moi.user.id} />
      <BarreJoueur moi={moi} />
      <MesOpa />
      <ResumeRetour moi={moi} />
    </>
  );
}

/** Le flux en direct (OPA, chantiers, solde), tant que le joueur est connecté. */
function FluxDirect() {
  useFluxDirect();
  return null;
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
      <p className="mt-3 text-xs text-ardoise">
        En te connectant, tu acceptes les{' '}
        <a href="/legal.html#regles" target="_blank" rel="noopener" className="underline hover:text-encre">
          règles du jeu
        </a>{' '}
        et la{' '}
        <a href="/legal.html#confidentialite" target="_blank" rel="noopener" className="underline hover:text-encre">
          politique de confidentialité
        </a>
        .
      </p>
      <LiensInfos className="mt-2" />
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

type Volet = 'profil' | 'messages' | 'quetes' | 'classement' | 'territoires';

/** Barre du haut : qui je suis, mon cash (qui monte tout seul), mes gemmes, mon revenu, mon chantier, mes territoires. */
function BarreJoueur({ moi }: { moi: MoiReponse }) {
  const [ouvert, setOuvert] = useState<Volet | null>(null);
  // Sur téléphone, le compte tient en une ligne pour laisser la carte visible (sans effet sur grand écran).
  const [deplie, setDeplie] = useState(false);
  const id = useId();
  const basculer = (volet: Volet) => {
    setDeplie(true);
    setOuvert((o) => (o === volet ? null : volet));
  };
  const choisi = () => {
    setOuvert(null);
    setDeplie(false);
  };
  const nonLus = moi.unreadNotifications;
  // Entre deux lectures de /me, le cash monte de revenu/h ÷ 3 600 chaque seconde (docs/04 § 4.4).
  const cash = useCashEnDirect() ?? moi.wallet.cash;
  const encaisser = useEncaisser();

  return (
    <section aria-label="Mon compte" className="panneau pointer-events-auto min-h-0 overflow-y-auto">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => basculer('profil')}
          aria-expanded={ouvert === 'profil'}
          aria-controls={`${id}-profil`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-2.5 text-left hover:bg-brume/60"
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
              {nomRang(moi.rankLevel)} · {moi.territories.owned} / {moi.territories.max} territoires
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDeplie((d) => !d)}
          aria-expanded={deplie}
          aria-controls={`${id}-details`}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 font-bold tabular-nums hover:bg-brume/60 md:hidden"
        >
          <span className="sr-only">Détails du compte, cash : </span>
          {tycoons(cash)}
          <Chevron ouvert={deplie} />
        </button>
      </div>
      {/* `repli` : le tutoriel montre ce bloc quand il vise un élément dedans (voir Tutoriel.tsx). */}
      <div id={`${id}-details`} className={deplie ? '' : 'repli max-md:hidden'}>
        <dl className="grid grid-cols-3 border-t border-encre/10 text-center" data-tuto="hud-wallet">
          <div className="p-2">
            <dt className="text-xs text-ardoise">Cash</dt>
            <dd className="font-bold tabular-nums">{tycoons(cash)}</dd>
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
        {/* Le cash affiché compte déjà ce montant ; le clic l'enregistre (tutoriel, quête « Trésorier »). */}
        <div className="flex items-center justify-between gap-2 border-t border-encre/10 px-3 py-2 text-sm">
          <span className="text-ardoise tabular-nums">+{tycoons(cash - moi.wallet.cash)} en attente</span>
          <button
            type="button"
            onClick={() => encaisser.mutate()}
            disabled={encaisser.isPending}
            data-tuto="collect-button"
            className="h-8 rounded-md bg-encre px-3 font-semibold text-white disabled:opacity-50"
          >
            Encaisser
          </button>
        </div>
        {encaisser.isError && (
          <p role="alert" className="px-3 pb-2 text-sm text-red-700">
            {messageErreur(encaisser.error)}
          </p>
        )}
        <ChantierEnCours possede={moi.territories.owned} />
        <button
          type="button"
          onClick={() => basculer('messages')}
          aria-expanded={ouvert === 'messages'}
          aria-controls={`${id}-messages`}
          className="flex w-full items-center justify-between gap-2 border-t border-encre/10 px-3 py-2 text-sm font-semibold hover:bg-brume/60"
        >
          Messages
          <span className="flex items-center gap-1.5 font-normal text-ardoise">
            {nonLus > 0 && (
              <span className="rounded-full bg-orange-500 px-1.5 text-xs font-bold text-white tabular-nums">
                {nonLus > 99 ? '99+' : nonLus}
                <span className="sr-only"> non lu{nonLus > 1 ? 's' : ''}</span>
              </span>
            )}
            <Chevron ouvert={ouvert === 'messages'} />
          </span>
        </button>
        {ouvert === 'messages' && <CentreMessages id={`${id}-messages`} nonLus={nonLus} onChoisi={choisi} />}
        <button
          type="button"
          onClick={() => basculer('quetes')}
          aria-expanded={ouvert === 'quetes'}
          aria-controls={`${id}-quetes`}
          data-tuto="quests-button"
          className="flex w-full items-center justify-between gap-2 border-t border-encre/10 px-3 py-2 text-sm font-semibold hover:bg-brume/60"
        >
          Quêtes du jour
          <Chevron ouvert={ouvert === 'quetes'} />
        </button>
        {ouvert === 'quetes' && <QuetesDuJour id={`${id}-quetes`} />}
        <button
          type="button"
          onClick={() => basculer('classement')}
          aria-expanded={ouvert === 'classement'}
          aria-controls={`${id}-classement`}
          data-tuto="leaderboard-button"
          className="flex w-full items-center justify-between gap-2 border-t border-encre/10 px-3 py-2 text-sm font-semibold hover:bg-brume/60"
        >
          Classement
          <Chevron ouvert={ouvert === 'classement'} />
        </button>
        {ouvert === 'classement' && <Classement id={`${id}-classement`} onChoisi={choisi} />}
        <button
          type="button"
          onClick={() => basculer('territoires')}
          aria-expanded={ouvert === 'territoires'}
          aria-controls={`${id}-territoires`}
          className="flex w-full items-center justify-between gap-2 border-t border-encre/10 px-3 py-2 text-sm font-semibold hover:bg-brume/60"
        >
          Mes territoires
          <span className="flex items-center gap-1.5 font-normal text-ardoise tabular-nums">
            {moi.territories.owned} / {moi.territories.max}
            <Chevron ouvert={ouvert === 'territoires'} />
          </span>
        </button>
        {ouvert === 'territoires' && <MesTerritoires id={`${id}-territoires`} onChoisi={choisi} />}
        {ouvert === 'profil' && <Profil id={`${id}-profil`} moi={moi} />}
        <LiensInfos className="border-t border-encre/10 px-3 py-2" />
      </div>
    </section>
  );
}

function Chevron({ ouvert }: { ouvert: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`size-4 stroke-current stroke-2 transition-transform motion-reduce:transition-none ${ouvert ? 'rotate-180' : ''}`}
      fill="none"
      aria-hidden="true"
    >
      <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    <div id={id} className="border-t border-encre/10">
      <form onSubmit={enregistrer} className="flex flex-col gap-3 p-3">
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
      <SupprimerCompte pseudo={moi.user.pseudo} />
    </div>
  );
}

/** Supprimer son compte : c'est définitif, donc le bouton rouge n'agit qu'une fois le pseudo retapé. */
function SupprimerCompte({ pseudo }: { pseudo: string }) {
  const supprimer = useSupprimerCompte();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  // Le pseudo est unique sans tenir compte des majuscules : on les ignore ici aussi.
  const confirme = saisie.trim().toLowerCase() === pseudo.toLowerCase();

  if (!ouvert) {
    return (
      <div className="px-3 pb-3">
        <button type="button" onClick={() => setOuvert(true)} className="text-sm text-red-700 hover:underline">
          Supprimer mon compte…
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-red-200 bg-red-50 p-3 text-sm text-encre">
      <p>
        <strong>C’est définitif.</strong> Tes communes redeviennent libres, tes bâtiments sont détruits, ton argent est
        perdu et tes OPA en cours sont annulées. Ton pseudo et ton e-mail sont effacés.
      </p>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ardoise">
        Pour confirmer, tape ton pseudo : {pseudo}
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          autoComplete="off"
          className="h-10 rounded-md border border-encre/15 bg-white px-2.5 text-base font-normal text-encre outline-none focus:border-red-700 focus:ring-2 focus:ring-red-200"
        />
      </label>
      {supprimer.isError && (
        <p role="alert" className="text-red-700">
          {supprimer.error.message}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setOuvert(false);
            setSaisie('');
          }}
          className="h-10 rounded-md px-3 font-semibold text-ardoise hover:bg-brume hover:text-encre"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => supprimer.mutate()}
          disabled={!confirme || supprimer.isPending}
          className="h-10 rounded-md bg-red-700 px-3 font-semibold text-white disabled:opacity-50"
        >
          Supprimer définitivement
        </button>
      </div>
    </div>
  );
}
