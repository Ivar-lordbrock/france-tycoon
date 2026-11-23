import type { CommuneCarte } from '@france-tycoon/shared';
import { useQueries } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { requeteCase } from '../api/carte.ts';
import { useCarte } from '../etat/carte.ts';
import { type Affiche, type CaseChargee, communesVoulues, planifier } from './affichage.ts';
import { casesPourVue } from './cases.ts';
import { bulleCommune, styleCommune } from './style.ts';

interface Dessin extends Affiche {
  calque: L.Polygon;
}

const PANNEAU = 'communes';

/**
 * Zooms ≥ 9 : communes des cases visibles, chargées en parallèle et mises en cache.
 * Les calques sont gérés à la main (ajout et retrait par différence) pour ne pas tout
 * redessiner à chaque déplacement.
 */
export function Communes({ actif }: { actif: boolean }) {
  const carte = useMap();
  const vue = useCarte((etat) => etat.vue);
  const selection = useCarte((etat) => etat.selection);
  const definirChargement = useCarte((etat) => etat.definirChargement);
  const definirSelection = useCarte((etat) => etat.definirSelection);

  const groupe = useRef<L.FeatureGroup | null>(null);
  const dessins = useRef(new Map<string, Dessin>());
  const survol = useRef<string | null>(null);
  const etiquette = useRef<L.Tooltip | null>(null);
  const selectionCourante = useRef<string | null>(selection);

  const cases = useMemo(() => (actif && vue ? casesPourVue(vue.bbox, vue.zoom) : []), [actif, vue]);
  const resultat = useQueries({
    queries: cases.map(requeteCase),
    combine: (reponses) => ({
      chargees: reponses.flatMap((r, i): CaseChargee[] => {
        const c = cases[i];
        return r.data && c ? [{ detail: c.detail, communes: r.data.features }] : [];
      }),
      toutEstCharge: reponses.every((r) => r.isSuccess),
      enCours: reponses.some((r) => r.isFetching),
      erreur: reponses.some((r) => r.isError),
      tronque: reponses.some((r) => r.data?.truncated),
    }),
  });

  const restyler = (insee: string | null) => {
    const dessin = insee ? dessins.current.get(insee) : undefined;
    if (!dessin) return;
    const selectionnee = insee === selectionCourante.current;
    dessin.calque.setStyle(
      styleCommune(dessin.commune.properties, { selectionnee, survolee: insee === survol.current }),
    );
    if (selectionnee) dessin.calque.bringToFront();
  };

  // Groupe de calques et étiquette partagée, créés une fois.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cycle de vie de la carte uniquement
  useEffect(() => {
    const g = L.featureGroup().addTo(carte);
    const bulle = L.tooltip({ direction: 'top', offset: [0, -10], className: 'etiquette' });
    etiquette.current = bulle;
    g.on('mouseover', (e: L.LeafletMouseEvent) => {
      const commune = (e.propagatedFrom as L.Polygon).feature as CommuneCarte | undefined;
      if (!commune) return;
      const ancien = survol.current;
      survol.current = commune.id;
      restyler(ancien);
      restyler(commune.id);
      // textContent, pas innerHTML : le pseudo vient d'un joueur.
      const texte = document.createElement('span');
      texte.textContent = bulleCommune(commune.properties);
      bulle.setContent(texte).setLatLng(e.latlng);
      carte.openTooltip(bulle);
    });
    g.on('mousemove', (e: L.LeafletMouseEvent) => bulle.setLatLng(e.latlng));
    g.on('mouseout', () => {
      const ancien = survol.current;
      survol.current = null;
      restyler(ancien);
      carte.closeTooltip(bulle);
    });
    g.on('click', (e: L.LeafletMouseEvent) => {
      const commune = (e.propagatedFrom as L.Polygon).feature as CommuneCarte | undefined;
      if (commune) definirSelection(commune.id);
    });
    groupe.current = g;
    return () => {
      carte.closeTooltip(bulle);
      g.remove();
      groupe.current = null;
      etiquette.current = null;
      dessins.current.clear();
    };
  }, [carte]);

  // Applique la différence entre ce qui est dessiné et ce que demandent les cases.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restyler ne lit que des refs et le store
  useEffect(() => {
    const g = groupe.current;
    if (!g) return;
    // Une commune retirée sous la souris ne reçoit pas de « mouseout » : on ferme son étiquette ici.
    const oublierSurvol = () => {
      survol.current = null;
      if (etiquette.current) carte.closeTooltip(etiquette.current);
    };
    if (!actif) {
      g.clearLayers();
      dessins.current.clear();
      oublierSurvol();
      return;
    }
    const plan = planifier(dessins.current, communesVoulues(resultat.chargees), resultat.toutEstCharge);
    for (const insee of plan.retirer) {
      const dessin = dessins.current.get(insee);
      if (dessin) g.removeLayer(dessin.calque);
      dessins.current.delete(insee);
    }
    for (const { detail, commune } of plan.ajouter) {
      const calque = L.GeoJSON.geometryToLayer(commune, { pane: PANNEAU }) as L.Polygon;
      calque.feature = commune;
      calque.setStyle(
        styleCommune(commune.properties, {
          selectionnee: commune.id === selectionCourante.current,
          survolee: commune.id === survol.current,
        }),
      );
      g.addLayer(calque);
      dessins.current.set(commune.id, { detail, commune, calque });
    }
    if (survol.current && !dessins.current.has(survol.current)) oublierSurvol();
    if (plan.ajouter.length > 0) restyler(selectionCourante.current);
  }, [actif, resultat.chargees, resultat.toutEstCharge]);

  // Met en avant la commune choisie (recherche ou clic).
  // biome-ignore lint/correctness/useExhaustiveDependencies: restyler ne lit que des refs
  useEffect(() => {
    const ancienne = selectionCourante.current;
    selectionCourante.current = selection;
    restyler(ancienne);
    restyler(selection);
  }, [selection]);

  // Résumé pour la barre d'état.
  const nombre = actif ? communesVoulues(resultat.chargees).size : 0;
  useEffect(() => {
    definirChargement({
      communes: nombre,
      enCours: actif && resultat.enCours,
      tronque: actif && resultat.tronque,
      erreur: actif && resultat.erreur,
    });
  }, [actif, nombre, resultat.enCours, resultat.tronque, resultat.erreur, definirChargement]);

  return null;
}
