import { ZOOM_MIN_COMMUNES } from '@france-tycoon/shared';
import { useEffect } from 'react';
import { MapContainer, Pane, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { useCarte } from '../etat/carte.ts';
import { Communes } from './Communes.tsx';
import { Departements } from './Departements.tsx';
import { Masque } from './Masque.tsx';
import { verrouiller, versLimites } from './navigation.ts';
import { VUE_METROPOLE } from './vues.ts';

const URL_TUILES = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION_TUILES =
  import.meta.env.VITE_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">les contributeurs d’OpenStreetMap</a>';

/** Donne la carte aux panneaux, suit la vue, et verrouille la Métropole au démarrage. */
function SuiviCarte() {
  const carte = useMap();
  const { definirCarte, definirVue } = useCarte.getState();

  const noterVue = () => {
    const b = carte.getBounds();
    definirVue({ zoom: carte.getZoom(), bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
  };
  useMapEvents({ moveend: noterVue });

  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule fois, à la création de la carte
  useEffect(() => {
    definirCarte(carte);
    // Suit la taille du conteneur (pas seulement celle de la fenêtre).
    const observateur = new ResizeObserver(() => carte.invalidateSize());
    observateur.observe(carte.getContainer());

    const tailleUtile = () => carte.getSize().x > 100 && carte.getSize().y > 100;
    const demarrer = () => {
      verrouiller(carte, VUE_METROPOLE);
      noterVue();
    };
    // Conteneur encore sans taille (onglet caché…) : le cadrage initial est faux, on le refait.
    const cadrerQuandVisible = () => {
      if (!tailleUtile()) return;
      carte.off('resize', cadrerQuandVisible);
      carte.fitBounds(versLimites(VUE_METROPOLE.bbox), { padding: [24, 24], animate: false });
      demarrer();
    };
    if (tailleUtile()) demarrer();
    else carte.on('resize', cadrerQuandVisible);

    return () => {
      observateur.disconnect();
      carte.off('resize', cadrerQuandVisible);
      definirCarte(null);
    };
  }, [carte]);
  return null;
}

/** Rendu canvas (`preferCanvas`) : des milliers de contours restent fluides. */
export function CarteFrance() {
  const zoom = useCarte((etat) => etat.vue?.zoom ?? 0);
  const communesVisibles = zoom >= ZOOM_MIN_COMMUNES;

  return (
    <MapContainer
      className="h-full w-full"
      bounds={versLimites(VUE_METROPOLE.bbox)}
      boundsOptions={{ padding: [24, 24] }}
      preferCanvas
      zoomControl={false}
      maxBoundsViscosity={1}
      minZoom={2}
      maxZoom={18}
    >
      <TileLayer url={URL_TUILES} attribution={ATTRIBUTION_TUILES} maxZoom={19} />
      <ZoomControl position="topright" zoomInTitle="Zoomer" zoomOutTitle="Dézoomer" />
      <SuiviCarte />
      <Pane name="masque" style={{ zIndex: 350 }}>
        <Masque />
      </Pane>
      <Pane name="departements" style={{ zIndex: 410 }}>
        {!communesVisibles && <Departements />}
      </Pane>
      <Pane name="communes" style={{ zIndex: 420 }}>
        <Communes actif={communesVisibles} />
      </Pane>
    </MapContainer>
  );
}
