import { useQueryClient } from '@tanstack/react-query';
import type { MultiPolygon, Polygon } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContoursZones, useDepartements } from '../api/carte.ts';
import { useMoi } from '../api/compte.ts';
import { suivre } from '../api/quetes.ts';
import { useCarte } from '../etat/carte.ts';
import { Icone } from '../hud/Icone.tsx';
import { allerVersVue } from '../map/navigation.ts';
import { type CleVue, VUES_METROPOLE, VUES_OUTRE_MER, type Vue } from '../map/vues.ts';
import { silhouette } from './silhouette.ts';

type Surface = Polygon | MultiPolygon;

/** Silhouette de chaque entrée, tirée des vrais contours (Corse = 2A + 2B). */
function useSilhouettes(): Partial<Record<CleVue, string>> {
  const zones = useContoursZones().data;
  const departements = useDepartements().data;
  return useMemo(() => {
    const chemins: Partial<Record<CleVue, string>> = {};
    for (const f of zones?.features ?? []) chemins[f.properties.zone as CleVue] = silhouette([f.geometry as Surface]);
    const corse = (departements?.features ?? []).filter(
      (f) => f.properties.code === '2A' || f.properties.code === '2B',
    );
    if (corse.length > 0) chemins.CORSE = silhouette(corse.map((f) => f.geometry as Surface));
    return chemins;
  }, [zones, departements]);
}

function BoutonVue({
  vue,
  chemin,
  active,
  onChoisir,
}: {
  vue: Vue;
  chemin?: string;
  active: boolean;
  onChoisir: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onChoisir}
        className={`flex w-full items-center gap-2.5 rounded-xl py-1.5 pr-3 pl-1.5 text-left text-[0.9rem] leading-tight text-encre ${
          active ? 'bg-brume font-semibold' : 'hover:bg-brume/60'
        }`}
      >
        <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
          {chemin ? (
            <path
              d={chemin}
              className={active ? 'fill-surligneur stroke-surligneur' : 'fill-encre/70 stroke-encre/70'}
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ) : (
            <rect x="8" y="8" width="16" height="16" rx="3" className="fill-brume" />
          )}
        </svg>
        {vue.nom}
      </button>
    </li>
  );
}

/** Les 12 zones et la Corse (docs/02, « Carte verrouillée sur la France ») ; `onChoisi` ferme ce qui les montre. */
export function SelecteurZones({ onChoisi }: { onChoisi: () => void }) {
  const carte = useCarte((etat) => etat.carte);
  const vueActive = useCarte((etat) => etat.vueActive);
  const definirVueActive = useCarte((etat) => etat.definirVueActive);
  const chemins = useSilhouettes();
  const { data: moi } = useMoi();
  const client = useQueryClient();

  const choisir = (vue: Vue) => {
    definirVueActive(vue.cle);
    if (carte) allerVersVue(carte, vue);
    if (moi && vue.zone !== 'MET') suivre(client, 'zone_visited', vue.zone); // quête « Cap sur l'Outre-mer »
    onChoisi();
  };
  const liste = (vues: Vue[]) =>
    vues.map((vue) => (
      <BoutonVue
        key={vue.cle}
        vue={vue}
        chemin={chemins[vue.cle]}
        active={vue.cle === vueActive}
        onChoisir={() => choisir(vue)}
      />
    ));

  return (
    <nav aria-label="Zones">
      <h3 className="titre-groupe">France métropolitaine</h3>
      <ul className="flex flex-col gap-0.5">{liste(VUES_METROPOLE)}</ul>
      <h3 className="titre-groupe mt-3">Outre-mer</h3>
      <ul className="flex flex-col gap-0.5">{liste(VUES_OUTRE_MER)}</ul>
    </nav>
  );
}

/** Ordinateur : le bouton de la zone, dans la barre de recherche, ouvre la liste juste en dessous. */
export function BoutonZones() {
  const vueActive = useCarte((etat) => etat.vueActive);
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const nom = [...VUES_METROPOLE, ...VUES_OUTRE_MER].find((v) => v.cle === vueActive)?.nom;

  // Un clic ailleurs ou Échap ferme la liste (sans fermer la fiche, qui écoute Échap sur window).
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOuvert(false);
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  return (
    <div ref={boite} className="relative shrink-0 max-md:hidden">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls="liste-zones"
        data-tuto="zone-selector"
        className="flex h-9 items-center gap-1.5 rounded-[18px] bg-brume pr-2.5 pl-3 text-sm font-semibold hover:bg-[#383b42]"
      >
        <Icone nom="globe" className="size-4" />
        <span className="max-w-[9rem] truncate">{nom}</span>
        <Icone nom="chevron" className="size-3.5" />
      </button>
      {ouvert && (
        <div
          id="liste-zones"
          className="panneau entree-toast absolute top-full right-0 mt-[22px] max-h-[calc(100dvh-7rem)] w-64 origin-top-right overflow-y-auto rounded-[22px] p-2"
        >
          <SelecteurZones onChoisi={() => setOuvert(false)} />
        </div>
      )}
    </div>
  );
}
