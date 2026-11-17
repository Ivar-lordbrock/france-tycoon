import { type FicheCommune, type MoiReponse, montantsOpa, type Opa } from '@france-tycoon/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useCashEnDirect } from '../api/batiments.ts';
import { messageErreur, nouvelleCle } from '../api/client.ts';
import { type ReponseOpa, useDevisOpa, useLancerOpa, useMesOpaEnCours, useOpa, useRepondreOpa } from '../api/opa.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { boutonPrincipal, boutonSecondaire, Confirmer } from './Confirmer.tsx';
import { tycoons } from './fiche-texte.ts';
import {
  confirmationAcceptation,
  confirmationDefense,
  confirmationLancement,
  confirmationRetrait,
  messageApres,
  raisonOpa,
  tempsRestant,
} from './opa-texte.ts';
import { estAMoi } from './territoires-texte.ts';

/**
 * OPA dans la fiche d'une commune : la lancer (commune d'un rival), ou y répondre pendant les 24 h
 * (défendre ou accepter si elle me vise, retirer mon offre si c'est la mienne).
 */
export function ActionsOpa({ fiche, moi }: { fiche: FicheCommune; moi: MoiReponse | null }) {
  // Gardés ici : la réponse du serveur remplace l'encadré (OPA lancée ou terminée) ; le message et
  // la suite de l'envoi doivent rester branchés.
  const [fait, setFait] = useState<string | null>(null);
  const lancer = useLancerOpa();
  const repondre = useRepondreOpa();

  let contenu = null;
  if (fiche.takeover)
    contenu = <OpaEnCours fiche={fiche} takeover={fiche.takeover} moi={moi} repondre={repondre} onFait={setFait} />;
  else if (fiche.owner && !estAMoi(fiche))
    contenu = <LancerOpa fiche={fiche} moi={moi} lancer={lancer} onFait={setFait} />;
  if (!contenu && !fait) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {fait && (
        <p role="status" className="rounded-md bg-brume px-3 py-2 text-sm font-semibold">
          {fait}
        </p>
      )}
      {contenu}
    </div>
  );
}

/** Commune d'un rival : le bouton « Lancer une OPA », ou pourquoi ce n'est pas possible. */
function LancerOpa({
  fiche,
  moi,
  lancer,
  onFait,
}: {
  fiche: FicheCommune;
  moi: MoiReponse | null;
  lancer: ReturnType<typeof useLancerOpa>;
  onFait: (message: string) => void;
}) {
  const [cle, setCle] = useState<string | null>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const devis = useDevisOpa(fiche.insee, cle !== null);
  const { data: mesOpa } = useMesOpaEnCours(moi !== null);
  const maintenant = useMaintenant(30_000);
  // Aperçu du bouton ; la confirmation montre le devis du serveur.
  const apercu = montantsOpa(fiche.totalValue).offre;
  const proprietaire = fiche.owner?.pseudo ?? 'Le propriétaire';

  const raisons = (codes: FicheCommune['actions']['takeoverReasons'], offre: number) =>
    codes
      .map((code) =>
        raisonOpa(code, {
          fiche,
          moi,
          offre,
          mesOpaLancees: mesOpa?.filter((o) => o.role === 'attacker').length ?? 0,
          maintenant,
        }),
      )
      .filter((texte): texte is string => texte !== null)
      .slice(0, 2);

  const fermer = () => {
    setCle(null);
    requestAnimationFrame(() => declencheur.current?.focus());
  };

  if (!fiche.actions.canTakeover || !moi) {
    const textes = raisons(fiche.actions.takeoverReasons, apercu);
    if (textes.length === 0) return null;
    return (
      <p className="text-sm text-ardoise">
        <span className="font-semibold text-encre">OPA impossible.</span> {textes.join(' ')}
      </p>
    );
  }

  if (cle === null) {
    return (
      <button
        ref={declencheur}
        type="button"
        onClick={() => {
          lancer.reset();
          setCle(nouvelleCle());
        }}
        className={`${boutonPrincipal} w-full`}
      >
        Lancer une OPA · {tycoons(apercu)}
      </button>
    );
  }

  if (devis.isPending) return <p className="text-sm text-ardoise">Calcul de l’offre…</p>;
  if (devis.isError || !devis.data.eligible) {
    const texte = devis.isError
      ? messageErreur(devis.error)
      : raisons(devis.data.reasons, devis.data.offerAmount).join(' ') || 'OPA impossible pour le moment.';
    return (
      <div className="flex items-start justify-between gap-2 text-sm">
        <p role="alert" className="text-red-700">
          {texte}
        </p>
        <button type="button" onClick={fermer} className={boutonSecondaire}>
          Fermer
        </button>
      </div>
    );
  }

  const { lignes, note } = confirmationLancement(devis.data, moi.wallet.cash, proprietaire);
  return (
    <Confirmer
      titre={`Lancer une OPA sur ${fiche.name} ?`}
      lignes={lignes}
      note={note}
      annuler="Annuler"
      valider={lancer.isPending ? 'Lancement…' : 'Lancer l’OPA'}
      focusSur="valider"
      occupe={lancer.isPending}
      erreur={lancer.isError ? messageErreur(lancer.error) : null}
      onAnnuler={fermer}
      onValider={() =>
        lancer.mutate(
          { insee: fiche.insee, cle },
          {
            onSuccess: ({ takeover }) => {
              setCle(null);
              onFait(messageApres(takeover));
            },
          },
        )
      }
    />
  );
}

type Confirmation = { reponse: ReponseOpa; cle: string } | null;

/** OPA en cours sur la commune : le compte à rebours, et mes réponses si elle me concerne. */
function OpaEnCours({
  fiche,
  takeover,
  moi,
  repondre,
  onFait,
}: {
  fiche: FicheCommune;
  takeover: NonNullable<FicheCommune['takeover']>;
  moi: MoiReponse | null;
  repondre: ReturnType<typeof useRepondreOpa>;
  onFait: (message: string) => void;
}) {
  const client = useQueryClient();
  const { data: opa } = useOpa(moi ? takeover.id : null);
  const maintenant = useMaintenant(1_000);
  const echue = maintenant >= takeover.endsAt;

  // Les 24 h sont passées : le serveur résout l'OPA à la lecture, on relit ce qui la montre.
  useEffect(() => {
    if (!echue) return;
    void Promise.all([
      client.invalidateQueries({ queryKey: ['fiche', fiche.insee] }),
      client.invalidateQueries({ queryKey: ['opa', takeover.id] }),
      client.invalidateQueries({ queryKey: ['moi'] }),
      client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
    ]);
  }, [echue, client, fiche.insee, takeover.id]);

  return (
    <section aria-label="OPA en cours" className="rounded-md border border-orange-300 bg-orange-50 p-3">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-orange-800">OPA en cours</span>
        <span className="tabular-nums text-ardoise">
          {echue ? 'Temps écoulé…' : `fin dans ${tempsRestant(takeover.endsAt, maintenant)}`}
        </span>
      </p>
      {opa && opa.status === 'pending' && !echue && moi ? (
        <Reponses opa={opa} fiche={fiche} moi={moi} repondre={repondre} onFait={onFait} />
      ) : (
        !opa && <p className="mt-1 text-sm text-ardoise">La commune peut changer de main d’ici la fin.</p>
      )}
    </section>
  );
}

/** Défendre ou accepter (défenseur), retirer son offre (attaquant), avec une confirmation. */
function Reponses({
  opa,
  fiche,
  moi,
  repondre,
  onFait,
}: {
  opa: Opa;
  fiche: FicheCommune;
  moi: MoiReponse;
  repondre: ReturnType<typeof useRepondreOpa>;
  onFait: (message: string) => void;
}) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const cash = useCashEnDirect() ?? moi.wallet.cash;

  const ouvrir = (reponse: ReponseOpa) => {
    repondre.reset();
    setConfirmation({ reponse, cle: nouvelleCle() });
  };
  const fermer = () => {
    setConfirmation(null);
    requestAnimationFrame(() => declencheur.current?.focus());
  };
  const valider = ({ reponse, cle }: NonNullable<Confirmation>) =>
    repondre.mutate(
      { opa, reponse, cle },
      {
        onSuccess: ({ takeover }) => {
          setConfirmation(null);
          onFait(messageApres(takeover));
        },
      },
    );

  if (confirmation) {
    const commun = {
      annuler: 'Annuler',
      occupe: repondre.isPending,
      erreur: repondre.isError ? messageErreur(repondre.error) : null,
      onAnnuler: fermer,
      onValider: () => valider(confirmation),
    };
    if (confirmation.reponse === 'defend') {
      const { lignes, note } = confirmationDefense(opa, cash);
      return (
        <div className="mt-2">
          <Confirmer
            {...commun}
            titre={`Défendre ${opa.territory.name} ?`}
            lignes={lignes}
            note={note}
            valider={repondre.isPending ? 'Défense…' : 'Défendre'}
            focusSur="valider"
          />
        </div>
      );
    }
    if (confirmation.reponse === 'accept') {
      const { lignes, note } = confirmationAcceptation(opa, fiche.incomePerHour);
      return (
        <div className="mt-2">
          <Confirmer
            {...commun}
            titre={`Vendre ${opa.territory.name} à ${opa.attacker.pseudo} ?`}
            lignes={lignes}
            note={note}
            valider={repondre.isPending ? 'Vente…' : 'Vendre'}
            danger
            focusSur="annuler"
          />
        </div>
      );
    }
    const { lignes, note } = confirmationRetrait(opa);
    return (
      <div className="mt-2">
        <Confirmer
          {...commun}
          titre="Retirer ton offre ?"
          lignes={lignes}
          note={note}
          valider={repondre.isPending ? 'Retrait…' : 'Retirer'}
          danger
          focusSur="annuler"
        />
      </div>
    );
  }

  if (opa.role === 'attacker') {
    return (
      <>
        <p className="mt-1 text-sm">
          Ton offre : <strong className="tabular-nums">{tycoons(opa.offerAmount)}</strong>. Sans réponse de{' '}
          {opa.defender.pseudo}, la commune sera à toi.
        </p>
        <button
          ref={declencheur}
          type="button"
          onClick={() => ouvrir('cancel')}
          className={`${boutonSecondaire} mt-2 w-full bg-white`}
        >
          Retirer mon offre
        </button>
      </>
    );
  }

  const manque = opa.defenseCost - cash;
  return (
    <>
      <p className="mt-1 text-sm">
        <strong>{opa.attacker.pseudo}</strong> veut racheter {opa.territory.name} pour{' '}
        <strong className="tabular-nums">{tycoons(opa.offerAmount)}</strong>. Sans réponse, la commune lui revient.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          ref={declencheur}
          type="button"
          onClick={() => ouvrir('defend')}
          disabled={manque > 0}
          className={boutonPrincipal}
        >
          Défendre · {tycoons(opa.defenseCost)}
        </button>
        <button type="button" onClick={() => ouvrir('accept')} className={`${boutonSecondaire} bg-white`}>
          Accepter
        </button>
      </div>
      {manque > 0 && <p className="mt-1 text-sm text-red-700">Il te manque {tycoons(manque)} pour défendre.</p>}
    </>
  );
}
