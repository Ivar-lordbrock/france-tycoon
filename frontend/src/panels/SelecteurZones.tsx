import { useQueryClient } from '@tanstack/react-query';
import type { MultiPolygon, Polygon } from 'geojson';
import { useMemo } from 'react';
import { useContoursZones, useDepartements } from '../api/carte.ts';
import { useMoi } from '../api/compte.ts';
import { suivre } from '../api/quetes.ts';
import { useCarte } from '../etat/carte.ts';
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
    <li className="shrink-0">
      <button
        type="button"
        aria-pressed={active}
        onClick={onChoisir}
        className={`flex w-full items-center gap-2.5 rounded-md py-1.5 pr-3 pl-1.5 text-left text-[0.9rem] leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-encre ${
          active ? 'bg-encre text-white' : 'text-encre hover:bg-brume'
        }`}
      >
        <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
          {chemin ? (
            <path
              d={chemin}
              className={active ? 'fill-surligneur stroke-surligneur' : 'fill-encre/80 stroke-encre/80'}
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ) : (
            <rect x="8" y="8" width="16" height="16" rx="3" className="fill-brume" />
          )}
        </svg>
        <span className="whitespace-nowrap">{vue.nom}</span>
      </button>
    </li>
  );
}

/** Sélecteur rapide des zones (docs/02, « Carte verrouillée sur la France »). */
export function SelecteurZones() {
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
    <nav aria-label="Zones" data-tuto="zone-selector" className="panneau pointer-events-auto max-md:w-full">
      <div className="max-md:flex max-md:gap-1 max-md:overflow-x-auto max-md:p-1.5 md:max-h-[calc(100dvh-10rem)] md:overflow-y-auto md:p-2">
        <h2 className="titre-groupe max-md:sr-only">France métropolitaine</h2>
        <ul className="flex gap-0.5 md:flex-col">{liste(VUES_METROPOLE)}</ul>
        <h2 className="titre-groupe max-md:sr-only md:mt-3">Outre-mer</h2>
        <ul className="flex gap-0.5 md:flex-col">{liste(VUES_OUTRE_MER)}</ul>
      </div>
    </nav>
  );
}
