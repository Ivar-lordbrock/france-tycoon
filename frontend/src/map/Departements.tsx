import { ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';
import type { Feature, Geometry } from 'geojson';
import type { Layer, LeafletMouseEvent, Path, PathOptions, Polygon } from 'leaflet';
import { GeoJSON, useMap } from 'react-leaflet';
import { type ProprietesDepartement, useDepartements } from '../api/carte.ts';
import { COULEURS } from './style.ts';

const STYLE: PathOptions = {
  color: COULEURS.encre,
  weight: 1,
  opacity: 0.22,
  fill: true,
  fillColor: COULEURS.surligneur,
  fillOpacity: 0,
};
const STYLE_SURVOL: PathOptions = { fillOpacity: 0.15, weight: 2, opacity: 1 };

/** Zooms < 9 : les départements, cliquables pour plonger jusqu'aux communes. */
export function Departements() {
  const carte = useMap();
  const { data } = useDepartements();
  if (!data) return null;

  const surChaque = (feature: Feature<Geometry, ProprietesDepartement>, calque: Layer) => {
    const { nom, code } = feature.properties;
    calque.bindTooltip(`${nom} (${code})`, { sticky: true, direction: 'top', className: 'etiquette' });
    calque.on({
      mouseover: (e: LeafletMouseEvent) => (e.target as Path).setStyle(STYLE_SURVOL),
      mouseout: (e: LeafletMouseEvent) => (e.target as Path).setStyle(STYLE),
      click: (e: LeafletMouseEvent) => {
        const limites = (e.target as Polygon).getBounds();
        const zoom = Math.max(ZOOM_MIN_COMMUNES, carte.getBoundsZoom(limites));
        carte.flyTo(limites.getCenter(), zoom, { duration: 0.8 });
      },
    });
  };

  return <GeoJSON data={data} style={STYLE} onEachFeature={surChaque} />;
}
