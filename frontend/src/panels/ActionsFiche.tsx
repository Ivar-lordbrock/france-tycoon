import type { FicheCommune, MoiReponse } from '@france-tycoon/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { messageErreur, nouvelleCle } from '../api/client.ts';
import { useAcheter, useVendre } from '../api/territoires.ts';
import { useCarte } from '../etat/carte.ts';
import { boutonPrincipal, boutonSecondaire, Confirmer } from './Confirmer.tsx';
import { tycoons } from './fiche-texte.ts';
import { apercuAchat, apercuVente, duree, estAMoi, pertesVente, raisonVente } from './territoires-texte.ts';

type Confirmation = { action: 'achat' | 'vente'; cle: string } | null;

/**
 * Acheter une commune libre, ou vendre la sienne à l'État, avec une étape de confirmation et un aperçu.
 * Une clé d'idempotence par confirmation : un double clic ou un nouvel essai ne paie qu'une fois.
 */
export function ActionsFiche({
  fiche,
  moi,
  raisonsAchat,
}: {
  fiche: FicheCommune;
  moi: MoiReponse | null;
  raisonsAchat: string[];
}) {
  const acheter = useAcheter();
  const vendre = useVendre();
  const definirOnglet = useCarte((etat) => etat.definirOnglet);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [fait, setFait] = useState<string | null>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  // La confirmation a pu faire défiler la fiche : le message de victoire (ou de vente) revient à l'écran.
  useEffect(() => {
    if (fait) message.current?.scrollIntoView({ block: 'nearest' });
  }, [fait]);
  const apercu = apercuAchat(fiche, moi ?? MOI_VIDE);
  const erreur = acheter.error ?? vendre.error;

  const ouvrir = (action: 'achat' | 'vente') => {
    acheter.reset();
    vendre.reset();
    setFait(null);
    setConfirmation({ action, cle: nouvelleCle() });
  };
  const fermer = () => {
    setConfirmation(null);
    // Le bouton qui a ouvert la confirmation revient au premier plan (clavier, lecteur d'écran).
    requestAnimationFrame(() => declencheur.current?.focus());
  };

  const confirmerAchat = (cle: string) =>
    acheter.mutate(
      { insee: fiche.insee, cle },
      {
        onSuccess: () => {
          // Pas de retour du focus : il tomberait sur « Vendre » et ferait défiler la fiche sous le message de victoire.
          setConfirmation(null);
          setFait(`${fiche.name} est à toi ! Personne ne peut te la prendre pendant ${duree(apercu.bouclier)}.`);
        },
      },
    );
  const confirmerVente = (cle: string) =>
    vendre.mutate(
      { insee: fiche.insee, cle },
      {
        onSuccess: ({ saleAmount }) => {
          fermer();
          setFait(`Vendue à l’État pour ${tycoons(saleAmount)}.`);
        },
      },
    );

  let contenu: ReactNode = null;

  if (fiche.state === 'free') {
    if (!fiche.actions.canBuy || !moi) {
      contenu = <p className="rounded-md bg-surligneur/30 px-3 py-2 text-sm">{raisonsAchat.join(' ')}</p>;
    } else if (confirmation?.action === 'achat') {
      const { cle } = confirmation;
      contenu = (
        <Confirmer
          titre={`Acheter ${fiche.name} ?`}
          lignes={[
            ['Prix', tycoons(apercu.prix)],
            ['Il te restera', tycoons(apercu.resteCash)],
            ['Revenu en plus', `+${tycoons(apercu.revenuParHeure)}/h`],
            ['Territoires', `${apercu.territoires.apres} / ${apercu.territoires.max}`],
          ]}
          note={`Bouclier de ${duree(apercu.bouclier)} : personne ne peut te la prendre pendant ce temps.${
            apercu.retour ? ` Remboursée par son revenu en ${duree(apercu.retour)} environ.` : ''
          }`}
          annuler="Annuler"
          valider={acheter.isPending ? 'Achat…' : 'Acheter'}
          focusSur="valider"
          occupe={acheter.isPending}
          erreur={acheter.isError ? messageErreur(acheter.error) : null}
          onAnnuler={fermer}
          onValider={() => confirmerAchat(cle)}
        />
      );
    } else {
      contenu = (
        <button
          ref={declencheur}
          type="button"
          onClick={() => ouvrir('achat')}
          data-tuto="buy-button"
          className={`${boutonPrincipal} w-full`}
        >
          Acheter · {tycoons(apercu.prix)}
        </button>
      );
    }
  } else if (estAMoi(fiche)) {
    const vente = apercuVente(fiche);
    const raisons = fiche.actions.sellReasons.map(raisonVente).filter((t): t is string => t !== null);
    if (fiche.actions.canSell && confirmation?.action === 'vente') {
      const { cle } = confirmation;
      contenu = (
        <Confirmer
          titre={`Vendre ${fiche.name} à l’État ?`}
          lignes={[
            ['Tu reçois', tycoons(vente.montant)],
            ['Valeur de la commune', tycoons(vente.valeur)],
            ['Revenu perdu', `−${tycoons(vente.revenuPerdu)}/h`],
          ]}
          note={`L’État paie 70 % de la valeur. ${pertesVente(vente)} La commune redevient libre : n’importe qui pourra l’acheter.`}
          annuler="Garder"
          valider={vendre.isPending ? 'Vente…' : 'Vendre'}
          danger
          focusSur="annuler"
          occupe={vendre.isPending}
          erreur={vendre.isError ? messageErreur(vendre.error) : null}
          onAnnuler={fermer}
          onValider={() => confirmerVente(cle)}
        />
      );
    } else {
      // La suite logique d'un achat est de construire : en principal ; vendre reste possible, en second.
      contenu = (
        <>
          <button type="button" onClick={() => definirOnglet('batiments')} className={`${boutonPrincipal} w-full`}>
            Construire ici
          </button>
          {fiche.actions.canSell ? (
            <button
              ref={declencheur}
              type="button"
              onClick={() => ouvrir('vente')}
              className={`${boutonSecondaire} w-full`}
            >
              Vendre à l’État · {tycoons(vente.montant)}
            </button>
          ) : (
            raisons.length > 0 && <p className="text-sm text-ardoise">{raisons.join(' ')}</p>
          )}
        </>
      );
    }
  }

  // Après un refus, la fiche est relue : si l'action n'est plus possible, les raisons ci-dessus l'expliquent.
  // Si la commune a changé de main (plus rien à proposer ici), le message du serveur reste visible.
  const erreurOrpheline = erreur && !contenu ? messageErreur(erreur) : null;
  if (!contenu && !fait && !erreurOrpheline) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {fait && (
        <p
          ref={message}
          role="status"
          className="entree-toast rounded-md bg-surligneur/50 px-3 py-2 text-sm font-semibold"
        >
          {fait}
        </p>
      )}
      {erreurOrpheline && (
        <p role="alert" className="text-sm text-red-700">
          {erreurOrpheline}
        </p>
      )}
      {contenu}
    </div>
  );
}

/** Pour calculer l'aperçu avant que /me ne réponde (le bouton n'est montré qu'une fois connecté). */
const MOI_VIDE = { wallet: { cash: 0, gems: 0 }, territories: { owned: 0, max: 0 } } as MoiReponse;
