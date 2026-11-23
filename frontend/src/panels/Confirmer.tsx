import { type KeyboardEvent, useEffect, useRef } from 'react';

export const bouton = 'h-10 rounded-xl px-3.5 font-semibold disabled:opacity-50';
/** Bouton en relief (index.css) : il s'enfonce sous le doigt. */
export const boutonPrincipal = 'relief h-10 px-4';
export const boutonSecondaire = `${bouton} border border-encre/15 text-encre hover:bg-brume`;
/** Petit bouton des listes (bâtiments). */
export const petitBouton = 'h-9 rounded-xl px-2.5 text-sm font-semibold disabled:opacity-50';

interface PropsConfirmer {
  titre: string;
  lignes: [string, string][];
  note: string;
  annuler: string;
  valider: string;
  danger?: boolean;
  /** Bouton qui reçoit le focus : « valider » pour un achat, « annuler » pour une vente (on détruit des choses). */
  focusSur: 'valider' | 'annuler';
  occupe: boolean;
  erreur: string | null;
  onAnnuler: () => void;
  onValider: () => void;
}

/** Étape de confirmation avec aperçu : achat, vente, chantiers. Échap annule sans fermer la fiche. */
export function Confirmer(props: PropsConfirmer) {
  const valider = useRef<HTMLButtonElement>(null);
  const annuler = useRef<HTMLButtonElement>(null);
  const { focusSur, onAnnuler } = props;

  useEffect(() => {
    (focusSur === 'valider' ? valider : annuler).current?.focus();
  }, [focusSur]);

  // Échap annule la confirmation sans fermer la fiche.
  const auClavier = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!props.occupe) onAnnuler();
  };

  return (
    <fieldset onKeyDown={auClavier} className="m-0 min-w-0 rounded-2xl border border-encre/15 p-4">
      <legend className="float-left w-full font-semibold">{props.titre}</legend>
      <dl className="clear-both pt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {props.lignes.map(([terme, valeur]) => (
          <div key={terme} className="contents">
            <dt className="text-ardoise">{terme}</dt>
            <dd className="text-right font-semibold tabular-nums">{valeur}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ardoise">{props.note}</p>
      {props.erreur && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {props.erreur}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button ref={annuler} type="button" onClick={onAnnuler} disabled={props.occupe} className={boutonSecondaire}>
          {props.annuler}
        </button>
        <button
          ref={valider}
          type="button"
          onClick={props.onValider}
          disabled={props.occupe}
          className={props.danger ? `${bouton} bg-danger text-fond hover:bg-danger/90` : boutonPrincipal}
        >
          {props.valider}
        </button>
      </div>
    </fieldset>
  );
}
