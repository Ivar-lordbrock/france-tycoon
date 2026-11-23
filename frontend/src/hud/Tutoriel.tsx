import { ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';
import { useEffect, useRef, useState } from 'react';
import { messageErreur } from '../api/client.ts';
import { useMoi } from '../api/compte.ts';
import { useQuetes } from '../api/quetes.ts';
import { etapeEnCours, useFaireEtape, usePasserTutoriel, useTutoriel } from '../api/tutoriel.ts';
import { useCarte } from '../etat/carte.ts';
import { useToasts } from '../etat/toasts.ts';
import { recompenseQuete } from '../panels/notifications-texte.ts';

/**
 * Le tutoriel : une bulle en bas de l'écran, l'élément concerné entouré (`data-tuto`), sans bloquer le jeu.
 * L'étape 1 sert d'accueil au premier lancement ; « Passer » arrête tout (proposé une fois aux anciens joueurs).
 */
export function Tutoriel() {
  const { data: moi } = useMoi();
  const { data } = useTutoriel(Boolean(moi));
  const faire = useFaireEtape();
  const passer = usePasserTutoriel();
  const [confirmer, setConfirmer] = useState(false);
  const [fini, setFini] = useState(false);
  const ajouterToast = useToasts((e) => e.ajouter);
  const zoom = useCarte((e) => e.vue?.zoom ?? 0);
  const zone = useCarte((e) => e.vueActive);
  const selection = useCarte((e) => e.selection);
  // Sans requête : se remplit quand le volet « Quêtes du jour » les charge.
  const { data: quetes } = useQuetes(false);
  const etape = moi ? etapeEnCours(data) : null;

  // Étapes « écran » validées dès que le joueur a agi (« Suivant » reste là au cas où), une seule fois par étape.
  const agi = {
    explorer_carte: zoom >= ZOOM_MIN_COMMUNES,
    selecteur_zones: zone !== 'MET',
    fiche_commune: selection !== null,
    quetes: quetes !== undefined,
  };
  const fait = etape !== null && agi[etape.key as keyof typeof agi] === true;
  const envoyee = useRef<string | null>(null);
  const { mutate } = faire;
  useEffect(() => {
    if (!etape || !fait || envoyee.current === etape.key) return;
    envoyee.current = etape.key;
    mutate(etape.key);
  }, [etape, fait, mutate]);

  // On passe à l'étape suivante : on fête la récompense de celle qui vient d'être faite ;
  // le tutoriel vient de finir (pas « Passer ») : carte de fin avec le prochain objectif.
  const precedente = useRef(etape);
  useEffect(() => {
    const avant = precedente.current;
    precedente.current = etape;
    if (!avant || avant.key === etape?.key) return;
    const faite = data?.steps.find((e) => e.key === avant.key);
    if (faite?.completedAt && (faite.rewardCash > 0 || faite.rewardGems > 0)) {
      ajouterToast({ ton: 'info', texte: `Bravo ! « ${faite.title} » te rapporte ${recompenseQuete(faite)}.` });
    }
    if (!etape && data?.completedAt) setFini(true);
  }, [etape, data, ajouterToast]);

  // L'élément visé peut être caché dans un panneau qui défile (compte, fiche) et qui rétrécit quand
  // un autre s'ouvre (téléphone) : on le garde en vue.
  const ancre = etape?.anchor;
  useEffect(() => {
    const cible = ancre ? document.querySelector(`[data-tuto~="${ancre}"]`) : null;
    const panneau = cible?.closest('.panneau');
    if (!cible || !panneau) return;
    const suivi = new ResizeObserver(() => cible.scrollIntoView({ block: 'nearest' }));
    suivi.observe(panneau);
    return () => suivi.disconnect();
  }, [ancre]);

  if (fini) {
    return (
      <section aria-label="Tutoriel" className="panneau pointer-events-auto w-full max-w-md self-center p-4">
        <h2 className="font-bold">Tutoriel terminé, bravo !</h2>
        <p className="mt-1 text-sm">
          Prochain objectif : ta deuxième commune. Construis pour faire monter ton revenu, et reviens chaque jour pour
          les quêtes.
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setFini(false)}
            className="h-9 rounded-md bg-encre px-3 font-semibold text-white"
          >
            C’est parti
          </button>
        </div>
      </section>
    );
  }
  if (!etape || !data) return null;
  const erreur = faire.error ?? passer.error;

  return (
    <section
      aria-label="Tutoriel"
      aria-live="polite"
      className="panneau pointer-events-auto w-full max-w-md self-center p-4"
    >
      {etape.anchor && (
        // `.repli` : bloc caché sur téléphone (compte replié, légende) ; montré s'il contient l'élément visé.
        <style>{`[data-tuto~="${etape.anchor}"]{outline:3px solid var(--color-surligneur);outline-offset:-3px}
.repli:has([data-tuto~="${etape.anchor}"]){display:block}
@media (prefers-reduced-motion:no-preference){[data-tuto~="${etape.anchor}"]{animation:tuto-cible 1s ease-in-out infinite alternate}}`}</style>
      )}
      <p className="text-xs text-ardoise tabular-nums">
        Tutoriel · étape {etape.position} / {data.steps.length}
      </p>
      <h2 className="font-bold">{etape.title}</h2>
      <p className="mt-1 text-sm">{etape.body}</p>
      {(etape.rewardCash > 0 || etape.rewardGems > 0) && (
        <p className="mt-1 text-sm font-semibold tabular-nums">Récompense : {recompenseQuete(etape)}</p>
      )}
      {erreur && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {messageErreur(erreur)}
        </p>
      )}
      {confirmer ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
          <span className="mr-auto">Passer le tutoriel ? Les récompenses restantes seront perdues.</span>
          <button
            type="button"
            onClick={() => setConfirmer(false)}
            className="h-9 rounded-md px-3 font-semibold text-ardoise hover:bg-brume hover:text-encre"
          >
            Non
          </button>
          <button
            type="button"
            onClick={() => passer.mutate()}
            disabled={passer.isPending}
            className="h-9 rounded-md bg-encre px-3 font-semibold text-white disabled:opacity-50"
          >
            Oui, passer
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmer(true)}
            className="h-9 rounded-md px-2 text-sm font-semibold text-ardoise hover:bg-brume hover:text-encre"
          >
            Passer le tutoriel
          </button>
          {etape.validatedBy === 'client' && (
            <button
              type="button"
              onClick={() => faire.mutate(etape.key)}
              disabled={faire.isPending}
              className="h-9 rounded-md bg-encre px-3 font-semibold text-white disabled:opacity-50"
            >
              {etape.position === 1 ? 'C’est parti' : 'Suivant'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
