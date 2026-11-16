import type { ResultatRecherche } from '@france-tycoon/shared';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useRecherche } from '../api/carte.ts';
import { useCarte } from '../etat/carte.ts';
import { allerVersCommune } from '../map/navigation.ts';
import { descriptionResultat } from './recherche-texte.ts';

function useAntiRebond<T>(valeur: T, delaiMs: number): T {
  const [stable, setStable] = useState(valeur);
  useEffect(() => {
    const minuteur = setTimeout(() => setStable(valeur), delaiMs);
    return () => clearTimeout(minuteur);
  }, [valeur, delaiMs]);
  return stable;
}

/** Recherche de commune avec autocomplétion (motif « combobox » de WAI-ARIA). Raccourci : « / ». */
export function Recherche() {
  const idListe = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState('');
  const [ouverte, setOuverte] = useState(false);
  const [active, setActive] = useState(0);
  const requete = useAntiRebond(saisie, 200);
  const { data, isError, isFetching } = useRecherche(requete);
  const carte = useCarte((etat) => etat.carte);
  const { definirSelection, definirVueActive } = useCarte.getState();

  const resultats = saisie.trim() ? (data?.results ?? []) : [];
  const aJour = requete === saisie && !isFetching;
  const montrerListe = ouverte && saisie.trim().length > 0;

  useEffect(() => {
    const raccourci = (e: globalThis.KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (e.key !== '/' || cible?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      champ.current?.focus();
    };
    window.addEventListener('keydown', raccourci);
    return () => window.removeEventListener('keydown', raccourci);
  }, []);

  const choisir = (r: ResultatRecherche) => {
    setSaisie(r.name);
    setOuverte(false);
    definirSelection(r.insee);
    definirVueActive(r.zone);
    if (carte) allerVersCommune(carte, r);
  };

  const auClavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOuverte(true);
      if (resultats.length > 0) {
        const pas = e.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + pas + resultats.length) % resultats.length);
      }
    } else if (e.key === 'Enter') {
      const r = resultats[active] ?? resultats[0];
      if (r) {
        e.preventDefault();
        choisir(r);
      }
    } else if (e.key === 'Escape') {
      if (montrerListe) setOuverte(false);
      else setSaisie('');
    }
  };

  let message: string | null = null;
  if (montrerListe && resultats.length === 0) {
    if (isError) message = 'Recherche indisponible : le serveur ne répond pas.';
    else if (aJour && data) message = `Aucune commune ne correspond à « ${saisie.trim()} ».`;
    else message = 'Recherche…';
  }

  return (
    <div className="relative">
      <label htmlFor={`${idListe}-champ`} className="sr-only">
        Rechercher une commune
      </label>
      <div className="flex items-center gap-2 rounded-md border border-encre/15 bg-white px-2.5 focus-within:border-encre focus-within:ring-2 focus-within:ring-surligneur">
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 fill-none stroke-ardoise stroke-2" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4.5 4.5" strokeLinecap="round" />
        </svg>
        <input
          ref={champ}
          id={`${idListe}-champ`}
          type="search"
          role="combobox"
          aria-expanded={montrerListe && resultats.length > 0}
          aria-controls={idListe}
          aria-autocomplete="list"
          aria-activedescendant={
            montrerListe && resultats[active] ? `${idListe}-${resultats[active].insee}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder="Rechercher une commune"
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setActive(0);
            setOuverte(true);
          }}
          onFocus={() => setOuverte(true)}
          onBlur={() => setOuverte(false)}
          onKeyDown={auClavier}
          className="h-10 w-full min-w-0 bg-transparent text-base text-encre outline-none placeholder:text-ardoise"
        />
        <span
          className="hidden rounded border border-encre/20 px-1.5 font-mono text-xs text-ardoise md:block"
          aria-hidden="true"
        >
          /
        </span>
      </div>

      {montrerListe && (
        <div className="panneau absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden">
          {resultats.length > 0 && (
            <div id={idListe} role="listbox" aria-label="Communes trouvées" className="max-h-80 overflow-y-auto py-1">
              {resultats.map((r, i) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: le clavier passe par le champ (aria-activedescendant)
                // biome-ignore lint/a11y/useFocusableInteractive: motif combobox, le focus reste dans le champ
                <div
                  key={r.insee}
                  id={`${idListe}-${r.insee}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choisir(r)}
                  className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-brume' : ''}`}
                >
                  <div className="font-semibold text-encre">{r.name}</div>
                  <div className="text-sm text-ardoise">{descriptionResultat(r)}</div>
                </div>
              ))}
            </div>
          )}
          {message && (
            <p role="status" className="px-3 py-2.5 text-sm text-ardoise">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
