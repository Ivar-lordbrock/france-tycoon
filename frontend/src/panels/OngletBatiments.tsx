import {
  type Chantier,
  type FicheCommune,
  facteurTaille,
  type MoiReponse,
  type TypeBatiment,
} from '@france-tycoon/shared';
import { type ReactNode, useRef, useState } from 'react';
import {
  type ActionBatiment,
  type ReponseBatiment,
  useActionBatiment,
  useCashEnDirect,
  useCatalogue,
  useFileChantiers,
} from '../api/batiments.ts';
import { messageErreur, nouvelleCle } from '../api/client.ts';
import { useMesTerritoires } from '../api/territoires.ts';
import { useMaintenant } from '../etat/horloge.ts';
import {
  apercuAmelioration,
  apercuConstruction,
  apercuDemolition,
  avancement,
  type BatimentFiche,
  type Contexte,
  effet,
  minuteur,
  variation,
} from './batiments-texte.ts';
import { Confirmer, petitBouton } from './Confirmer.tsx';
import { tycoons } from './fiche-texte.ts';
import { duree } from './territoires-texte.ts';

type Cible = { action: 'construire'; typeCode: string } | { action: 'ameliorer' | 'annuler' | 'demolir'; id: number };

/** Repère du bouton qui ouvre une confirmation (`data-cible`) : le bouton est remplacé pendant la confirmation. */
const repere = (cible: Cible) =>
  cible.action === 'construire' ? `construire:${cible.typeCode}` : `${cible.action}:${cible.id}`;

const petitPrincipal = `${petitBouton} bg-encre text-white hover:bg-encre/90`;
const petitSecondaire = `${petitBouton} border border-encre/15 text-encre hover:bg-brume`;
const petitDiscret = `${petitBouton} text-ardoise hover:bg-brume hover:text-encre`;

/**
 * Onglet « Bâtiments » d'une de mes communes : mes bâtiments (minuteur pendant un chantier),
 * puis ce que je peux construire. Chaque action passe par une confirmation avec aperçu.
 */
export function OngletBatiments({ fiche, moi }: { fiche: FicheCommune; moi: MoiReponse }) {
  const { data: catalogue, isPending, isError } = useCatalogue();
  const { data: file } = useFileChantiers(true);
  const { data: mesTerritoires } = useMesTerritoires(true);
  const cash = useCashEnDirect() ?? moi.wallet.cash;
  const maintenant = useMaintenant(1_000);
  const action = useActionBatiment();
  const [confirmation, setConfirmation] = useState<{ cible: Cible; cle: string } | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const declencheur = useRef<string | null>(null);
  const zone = useRef<HTMLDivElement>(null);

  if (isPending) return <p className="text-sm text-ardoise">Chargement des bâtiments…</p>;
  if (isError) return <p className="text-sm text-ardoise">Bâtiments indisponibles : le serveur ne répond pas.</p>;

  const ctx: Contexte = {
    fiche,
    catalogue,
    cash,
    aUnSiege: fiche.isCapital || (mesTerritoires?.territories.some((t) => t.isCapital) ?? false),
  };
  const fT = facteurTaille(fiche.baseValue);
  const typeDe = (code: string) => catalogue.find((t) => t.code === code);
  const chantiers = file?.works ?? [];
  const fileLibre = !file || chantiers.length < file.slots;
  const chantierIci = (id: number) => chantiers.find((w) => w.buildingId === id);

  const ouvrir = (cible: Cible) => {
    declencheur.current = repere(cible);
    action.reset();
    setFait(null);
    setConfirmation({ cible, cle: nouvelleCle() });
  };
  const fermer = () => {
    setConfirmation(null);
    // Retour au bouton qui a ouvert la confirmation, s'il est encore là ; sinon en haut de l'onglet.
    requestAnimationFrame(() => {
      const bouton = zone.current?.querySelector<HTMLButtonElement>(`[data-cible="${declencheur.current}"]`);
      if (bouton && !bouton.disabled) bouton.focus();
      else zone.current?.focus();
    });
  };
  const lancer = (demande: ActionBatiment, message: (reponse: ReponseBatiment) => string) =>
    action.mutate(demande, {
      onSuccess: (reponse) => {
        fermer();
        setFait(message(reponse));
      },
    });

  const enConfirmation = (cible: Cible) => confirmation !== null && repere(confirmation.cible) === repere(cible);

  const communs = {
    occupe: action.isPending,
    erreur: action.isError ? messageErreur(action.error) : null,
    onAnnuler: fermer,
  };

  /** La confirmation d'une action, prête à afficher sous l'élément concerné. */
  function confirmer(cible: Cible): ReactNode {
    if (!confirmation || !enConfirmation(cible)) return null;
    const { cle } = confirmation;

    if (cible.action === 'construire') {
      const type = typeDe(cible.typeCode);
      if (!type) return null;
      const a = apercuConstruction(type, ctx);
      const siege = type.category === 'siege';
      return (
        <Confirmer
          titre={`Construire « ${type.name} » ?`}
          lignes={[
            ['Prix', tycoons(a.cout)],
            ['Il te restera', tycoons(a.resteCash)],
            ['Durée', duree(a.duree)],
            siege ? ['Effet', effet(type, 1, fT)] : ['Revenu de la commune', variation(a.revenu)],
          ]}
          note={
            siege
              ? 'La commune devient ta capitale dès maintenant : personne ne pourra la prendre par OPA, et elle ne se vendra pas.'
              : 'Le chantier occupe ta file de construction. Tu peux l’annuler : tout est remboursé.'
          }
          annuler="Annuler"
          valider={action.isPending ? 'Lancement…' : 'Construire'}
          focusSur="valider"
          onValider={() =>
            lancer({ action: 'construire', insee: fiche.insee, typeCode: type.code, cle }, (r) =>
              'building' in r && r.building?.worksEndsAt
                ? `Chantier lancé : ${type.name}, fini dans ${minuteur(r.building.worksEndsAt - Math.floor(Date.now() / 1000))}.`
                : `Chantier lancé : ${type.name}.`,
            )
          }
          {...communs}
        />
      );
    }

    const batiment = fiche.buildings.find((b) => b.id === cible.id);
    const type = batiment && typeDe(batiment.typeCode);
    if (!batiment || !type) return null;

    if (cible.action === 'ameliorer') {
      const a = apercuAmelioration(type, batiment, ctx);
      const niveau = batiment.level + 1;
      return (
        <Confirmer
          titre={`Passer « ${type.name} » au niveau ${niveau} ?`}
          lignes={[
            ['Prix', tycoons(a.cout)],
            ['Il te restera', tycoons(a.resteCash)],
            ['Durée', duree(a.duree)],
            type.territorySlotBonus > 0
              ? ['Effet', `${effet(type, batiment.level, fT)} → ${effet(type, niveau, fT)}`]
              : ['Revenu de la commune', variation(a.revenu)],
          ]}
          note={`Pendant le chantier, il garde l’effet du niveau ${batiment.level}. Tu peux l’annuler : tout est remboursé.`}
          annuler="Annuler"
          valider={action.isPending ? 'Lancement…' : 'Améliorer'}
          focusSur="valider"
          onValider={() =>
            lancer(
              { action: 'ameliorer', insee: fiche.insee, id: batiment.id, cle },
              () => `Chantier lancé : ${type.name} niveau ${niveau}.`,
            )
          }
          {...communs}
        />
      );
    }

    if (cible.action === 'annuler') {
      const chantier = chantierIci(batiment.id);
      const premier = batiment.level === 0;
      return (
        <Confirmer
          titre={`Arrêter le chantier de « ${type.name} » ?`}
          lignes={[['Remboursé', chantier ? tycoons(chantier.cost) : 'tout le prix payé']]}
          note={
            premier
              ? `Il n’était pas encore construit : il disparaît${type.category === 'siege' ? ', et la commune n’est plus ta capitale' : ''}.`
              : `Il reste au niveau ${batiment.level}.`
          }
          annuler="Continuer"
          valider={action.isPending ? 'Arrêt…' : 'Arrêter'}
          focusSur="annuler"
          onValider={() =>
            lancer({ action: 'annuler', insee: fiche.insee, id: batiment.id, cle }, (r) =>
              'refunded' in r ? `Chantier arrêté : ${tycoons(r.refunded)} remboursés.` : 'Chantier arrêté.',
            )
          }
          {...communs}
        />
      );
    }

    const a = apercuDemolition(type, batiment, ctx);
    return (
      <Confirmer
        titre={`Démolir « ${type.name} » ?`}
        lignes={[
          ['Tu récupères', `≈ ${tycoons(a.rembourse)}`],
          ['Revenu de la commune', variation(a.revenu)],
        ]}
        note="Tu ne récupères que 30 % de ce que tu as payé pour ses niveaux. Ses emplacements se libèrent."
        annuler="Garder"
        valider={action.isPending ? 'Démolition…' : 'Démolir'}
        danger
        focusSur="annuler"
        onValider={() =>
          lancer({ action: 'demolir', insee: fiche.insee, id: batiment.id }, (r) =>
            'refunded' in r ? `Démolition faite : ${tycoons(r.refunded)} récupérés.` : 'Démolition faite.',
          )
        }
        {...communs}
      />
    );
  }

  const libres = fiche.buildingSlots.total - fiche.buildingSlots.used;
  const enCours = chantiers[0];

  return (
    <div ref={zone} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <p className="text-sm text-ardoise">
        {libres} emplacement{libres > 1 ? 's' : ''} libre{libres > 1 ? 's' : ''} sur {fiche.buildingSlots.total}
      </p>
      {!fileLibre && enCours && (
        <p className="rounded-md bg-surligneur/30 px-3 py-2 text-sm">
          {enCours.territoryInsee === fiche.insee
            ? 'Un chantier est en cours ici'
            : `Un chantier est en cours à ${enCours.territoryName}`}{' '}
          : attends qu’il finisse (ou arrête-le) pour en lancer un autre.
        </p>
      )}
      {fait && (
        <p role="status" className="rounded-md bg-brume px-3 py-2 text-sm font-semibold">
          {fait}
        </p>
      )}
      {action.isError && !confirmation && (
        <p role="alert" className="text-sm text-red-700">
          {messageErreur(action.error)}
        </p>
      )}

      {fiche.buildings.length > 0 && (
        <section aria-labelledby="mes-batiments">
          <h3 id="mes-batiments" className="text-sm font-semibold">
            Tes bâtiments
          </h3>
          <ul className="mt-1.5 flex flex-col gap-2">
            {fiche.buildings.map((b) => {
              const type = typeDe(b.typeCode);
              if (!type) return null;
              return (
                <li key={b.id} className="rounded-md border border-encre/10 p-2.5">
                  <LigneBatiment
                    batiment={b}
                    type={type}
                    fT={fT}
                    chantier={chantierIci(b.id)}
                    maintenant={maintenant}
                    amelioration={apercuAmelioration(type, b, ctx)}
                    fileLibre={fileLibre}
                    onAction={(a) => ouvrir({ action: a, id: b.id })}
                    confirmation={
                      confirmer({ action: 'ameliorer', id: b.id }) ??
                      confirmer({ action: 'annuler', id: b.id }) ??
                      confirmer({ action: 'demolir', id: b.id })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="construire">
        <h3 id="construire" className="text-sm font-semibold">
          Construire
        </h3>
        <ul className="mt-1 divide-y divide-encre/10">
          {catalogue.map((type) => {
            const a = apercuConstruction(type, ctx);
            const confirmation = confirmer({ action: 'construire', typeCode: type.code });
            return (
              <li key={type.code} className="py-2">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {type.name} <span className="text-xs font-normal text-ardoise">· {type.slotSize} empl.</span>
                    </p>
                    <p className="text-xs text-ardoise tabular-nums">
                      {tycoons(a.cout)} · {effet(type, 1, fT)} · {duree(a.duree)}
                    </p>
                    {a.raison && <p className="text-xs text-ardoise">{a.raison}</p>}
                  </div>
                  {!confirmation && (
                    <button
                      type="button"
                      disabled={a.raison !== null || !fileLibre}
                      onClick={() => ouvrir({ action: 'construire', typeCode: type.code })}
                      data-cible={repere({ action: 'construire', typeCode: type.code })}
                      data-tuto={type.code === 'residence' ? 'build-button' : undefined}
                      className={petitPrincipal}
                      aria-label={`Construire ${type.name} pour ${tycoons(a.cout)}`}
                    >
                      Construire
                    </button>
                  )}
                </div>
                {confirmation && <div className="mt-2">{confirmation}</div>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function LigneBatiment({
  batiment,
  type,
  fT,
  chantier,
  maintenant,
  amelioration,
  fileLibre,
  onAction,
  confirmation,
}: {
  batiment: BatimentFiche;
  type: TypeBatiment;
  fT: number;
  chantier: Chantier | undefined;
  maintenant: number;
  amelioration: ReturnType<typeof apercuAmelioration>;
  fileLibre: boolean;
  onAction: (action: 'ameliorer' | 'annuler' | 'demolir') => void;
  confirmation: ReactNode;
}) {
  const fin = chantier?.endsAt ?? batiment.worksEndsAt;
  const enChantier = batiment.targetLevel !== null && fin !== null;
  const restant = enChantier ? fin - maintenant : 0;
  const part = chantier ? avancement(chantier.startedAt, chantier.endsAt, maintenant) : null;
  const siege = type.category === 'siege';

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">{type.name}</span>
        <span className="shrink-0 text-sm text-ardoise tabular-nums">
          niv. {batiment.level} / {type.maxLevel}
        </span>
      </div>
      <p className="text-sm tabular-nums">{effet(type, batiment.level, fT)}</p>

      {enChantier && (
        <div className="mt-1.5">
          <p className="flex justify-between text-xs tabular-nums">
            <span>{batiment.level === 0 ? 'Construction' : `Vers le niveau ${batiment.targetLevel}`}</span>
            <span className="font-semibold">{restant > 0 ? minuteur(restant) : 'Terminé, mise à jour…'}</span>
          </p>
          {part !== null && (
            <div
              role="progressbar"
              aria-label={`Chantier de ${type.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(part * 100)}
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-brume"
            >
              <div className="h-full rounded-full bg-encre" style={{ width: `${part * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {confirmation ? (
        <div className="mt-2">{confirmation}</div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {enChantier ? (
            <button
              type="button"
              onClick={() => onAction('annuler')}
              data-cible={`annuler:${batiment.id}`}
              className={petitSecondaire}
            >
              Arrêter le chantier
            </button>
          ) : (
            <>
              {batiment.level < type.maxLevel && (
                <button
                  type="button"
                  disabled={!fileLibre || amelioration.raison !== null}
                  onClick={() => onAction('ameliorer')}
                  data-cible={`ameliorer:${batiment.id}`}
                  className={petitPrincipal}
                >
                  Niveau {batiment.level + 1} · {tycoons(amelioration.cout)}
                </button>
              )}
              {!siege && (
                <button
                  type="button"
                  onClick={() => onAction('demolir')}
                  data-cible={`demolir:${batiment.id}`}
                  className={petitDiscret}
                >
                  Démolir
                </button>
              )}
            </>
          )}
          {!enChantier && amelioration.raison && batiment.level < type.maxLevel && (
            <span className="text-xs text-ardoise">{amelioration.raison}</span>
          )}
        </div>
      )}
    </>
  );
}
