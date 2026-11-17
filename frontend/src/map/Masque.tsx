import { useMemo } from 'react';
import { Polygon } from 'react-leaflet';
import { useContoursZones } from '../api/carte.ts';
import { anneauxDuMasque } from './masque.ts';
import { COULEURS } from './style.ts';

/** Estompe tout ce qui n'est pas français : seules les communes importées comptent dans le jeu. */
export function Masque() {
  const { data } = useContoursZones();
  const anneaux = useMemo(() => (data ? anneauxDuMasque(data) : null), [data]);
  if (!anneaux) return null;
  return (
    <Polygon
      positions={anneaux}
      interactive={false}
      pathOptions={{ stroke: false, fillColor: COULEURS.masque, fillOpacity: 0.42, fillRule: 'evenodd' }}
    />
  );
}
