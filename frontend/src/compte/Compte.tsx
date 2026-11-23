import { type MoiReponse, PSEUDO_MAX, pseudoSchema, signalerCorpsSchema } from '@france-tycoon/shared';
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
import { useSignaler } from '../api/site.ts';
import { useCarte } from '../etat/carte.ts';
import { ajouterToast } from '../etat/toasts.ts';
import { SuiviChantiers } from '../hud/ChantierEnCours.tsx';
import { Icone, Piece } from '../hud/Icone.tsx';
import { MesOpa } from '../hud/MesOpa.tsx';
import { ResumeRetour } from '../hud/ResumeRetour.tsx';
import { clair } from '../map/style.ts';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { BoutonGoogle } from './BoutonGoogle.tsx';
import { LiensInfos } from './LiensInfos.tsx';

/** Coin du joueur : connexion, ou ses ressources en haut à droite (cash, revenu, gemmes, encaisser). */
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
      <SuiviChantiers />
      <Ressources moi={moi} />
    </>
  );
}

/** Sous les ressources : les OPA en cours et le résumé des chantiers finis pendant l'absence. */
export function Alertes() {
  const { data: moi } = useMoi();
  if (!moi) return null;
  return (
    <>
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
    <section aria-labelledby={`${id}-titre`} className="panneau pointer-events-auto w-full rounded-[28px] p-5 md:w-80">
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
                className="h-10 min-w-0 flex-1 rounded-xl border border-encre/15 px-3 outline-none placeholder:text-ardoise focus:border-encre focus:ring-2 focus:ring-surligneur"
              />
              <button type="submit" disabled={connexion.isPending || !pseudo.trim()} className="relief h-10 px-4">
                Entrer
              </button>
            </div>
          </form>
        )}
        {config && !config.googleClientId && !config.devLogin && (
          <p className="text-sm text-ardoise">Connexion pas encore configurée (voir docs/08-connexion-google.md).</p>
        )}
        {connexion.isError && (
          <p role="alert" className="text-sm text-danger">
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

/** Rond à la couleur du joueur (éclaircie, comme sur la carte), ou sa photo Google. */
export function Avatar({ moi }: { moi: MoiReponse }) {
  const { avatarUrl, pseudo, markerColor } = moi.user;
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-[34px] shrink-0 rounded-full" />;
  }
  return (
    <span
      className="grid size-[34px] shrink-0 place-items-center rounded-full text-sm font-extrabold text-fond"
      style={{ background: clair(markerColor) }}
      aria-hidden="true"
    >
      {pseudo.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Bouton rond de l'avatar : ouvre la fenêtre du profil. */
export function BoutonProfil({ moi, className = '' }: { moi: MoiReponse; className?: string }) {
  const volet = useCarte((etat) => etat.volet);
  const basculerVolet = useCarte((etat) => etat.basculerVolet);
  return (
    <button
      type="button"
      onClick={() => basculerVolet('profil')}
      aria-expanded={volet === 'profil'}
      aria-controls="fenetre"
      aria-label={`Mon profil (${moi.user.pseudo})`}
      className={`grid shrink-0 place-items-center rounded-full ${className}`}
    >
      <Avatar moi={moi} />
    </button>
  );
}

/** En haut à droite : mon cash (qui monte tout seul), mon revenu, mes gemmes, et « Encaisser ». */
function Ressources({ moi }: { moi: MoiReponse }) {
  // Entre deux lectures de /me, le cash monte de revenu/h ÷ 3 600 chaque seconde (docs/04 § 4.4).
  const cash = useCashEnDirect() ?? moi.wallet.cash;
  const enAttente = cash - moi.wallet.cash;
  const encaisser = useEncaisser();

  return (
    <section
      aria-label="Mon compte"
      className="panneau pointer-events-auto flex h-[52px] items-center gap-0.5 rounded-[26px] px-2 max-md:h-[46px] max-md:w-full max-md:justify-between max-md:pr-1.5 max-md:pl-1"
    >
      <BoutonProfil moi={moi} className="max-md:hidden" />
      <dl data-tuto="hud-wallet" className="flex items-center text-[15px] font-bold tabular-nums max-md:text-sm">
        <div className="px-2.5 max-md:px-1.5">
          <dt className="sr-only">Cash</dt>
          <dd className="flex items-center gap-[7px]">
            <Piece />
            {entier(cash)}
          </dd>
        </div>
        <div className="px-2.5 max-md:px-1.5">
          <dt className="sr-only">Revenu par heure</dt>
          <dd className="text-succes">
            +{entier(moi.incomePerHour)}
            <span className="text-xs font-medium text-ardoise">/h</span>
          </dd>
        </div>
        <div className="px-2.5 max-md:px-1.5">
          <dt className="sr-only">Gemmes</dt>
          <dd className="flex items-center gap-1.5 text-[#c4b5fd]">
            <Icone nom="gemme" className="size-[17px]" />
            {entier(moi.wallet.gems)}
          </dd>
        </div>
      </dl>
      {/* Le cash affiché compte déjà ce montant ; le clic l'enregistre (tutoriel, quête « Trésorier »). */}
      <button
        type="button"
        onClick={() =>
          encaisser.mutate(undefined, { onError: (e) => ajouterToast({ ton: 'erreur', texte: messageErreur(e) }) })
        }
        disabled={encaisser.isPending}
        data-tuto="collect-button"
        className="relief relief-jaune ml-1.5 h-9 shrink-0 rounded-[18px] px-3.5 text-sm whitespace-nowrap tabular-nums"
      >
        Encaisser
        {enAttente > 0 && <span className="font-semibold opacity-70 max-sm:hidden"> +{tycoons(enAttente)}</span>}
      </button>
    </section>
  );
}

/** Fenêtre « Mon profil » : pseudo, couleur, déconnexion, suppression du compte et liens. */
export function Profil({ moi }: { moi: MoiReponse }) {
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
    <div>
      <form onSubmit={enregistrer} className="flex flex-col gap-3 p-3">
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-ardoise">
            Pseudo
            <input
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              maxLength={PSEUDO_MAX}
              aria-invalid={!verifie.success}
              className="h-10 rounded-xl border border-encre/15 px-3 text-base font-normal text-encre outline-none focus:border-encre focus:ring-2 focus:ring-surligneur"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ardoise">
            Couleur
            <input
              type="color"
              value={couleur}
              onChange={(e) => setCouleur(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-xl border border-encre/15 bg-fond p-1"
            />
          </label>
        </div>
        {!verifie.success && <p className="text-sm text-danger">3 à 24 lettres, chiffres, espaces, . _ ou -.</p>}
        {modifier.isError && (
          <p role="alert" className="text-sm text-danger">
            {modifier.error.message}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={() => deconnexion.mutate()}
            disabled={deconnexion.isPending}
            className="h-10 rounded-xl px-3 text-sm font-semibold text-ardoise hover:bg-brume hover:text-encre"
          >
            Se déconnecter
          </button>
          <button
            type="submit"
            disabled={!change || !verifie.success || modifier.isPending}
            className="relief h-10 px-4"
          >
            {modifier.isSuccess && !change ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </form>
      <SignalerBug />
      <SupprimerCompte pseudo={moi.user.pseudo} />
      <LiensInfos className="border-t border-encre/10 px-3 pt-2" />
    </div>
  );
}

/** « Signaler un bug » : un petit texte pour l'équipe, avec la page où l'on était. 5 par jour. */
function SignalerBug() {
  const signaler = useSignaler();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const verifie = signalerCorpsSchema.safeParse({ body: texte });

  if (!ouvert) {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="text-sm text-ardoise hover:text-encre hover:underline"
        >
          {signaler.isSuccess ? 'Merci ! L’équipe va lire ton message. En signaler un autre…' : 'Signaler un bug…'}
        </button>
      </div>
    );
  }
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    if (!verifie.success) return;
    signaler.mutate(
      { body: verifie.data.body, page: window.location.pathname.slice(0, 200) },
      {
        onSuccess: () => {
          setOuvert(false);
          setTexte('');
        },
      },
    );
  };
  return (
    <form onSubmit={envoyer} className="flex flex-col gap-2 border-t border-encre/10 p-3 text-sm">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ardoise">
        Qu’est-ce qui ne marche pas ?
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Ce que tu faisais, ce que tu as vu…"
          className="resize-y rounded-xl border border-encre/15 bg-fond px-2.5 py-2 text-base font-normal text-encre outline-none focus:border-encre focus:ring-2 focus:ring-surligneur"
        />
      </label>
      {texte.trim().length > 0 && !verifie.success && <p className="text-xs text-ardoise">Au moins 10 caractères.</p>}
      {signaler.isError && (
        <p role="alert" className="text-danger">
          {messageErreur(signaler.error)}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="h-10 rounded-xl px-3 font-semibold text-ardoise hover:bg-brume hover:text-encre"
        >
          Annuler
        </button>
        <button type="submit" disabled={!verifie.success || signaler.isPending} className="relief h-10 px-4">
          Envoyer
        </button>
      </div>
    </form>
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
        <button type="button" onClick={() => setOuvert(true)} className="text-sm text-danger hover:underline">
          Supprimer mon compte…
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-danger/30 bg-danger/10 p-3 text-sm text-encre">
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
          className="h-10 rounded-xl border border-encre/15 bg-fond px-2.5 text-base font-normal text-encre outline-none focus:border-danger focus:ring-2 focus:ring-danger/30"
        />
      </label>
      {supprimer.isError && (
        <p role="alert" className="text-danger">
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
          className="h-10 rounded-xl px-3 font-semibold text-ardoise hover:bg-brume hover:text-encre"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => supprimer.mutate()}
          disabled={!confirme || supprimer.isPending}
          className="h-10 rounded-xl bg-danger px-3 font-semibold text-fond disabled:opacity-50"
        >
          Supprimer définitivement
        </button>
      </div>
    </div>
  );
}
