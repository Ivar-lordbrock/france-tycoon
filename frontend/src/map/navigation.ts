import { type BoiteCarte, type ResultatRecherche, ZOOM_MIN_COMMUNES, type ZoneCode } from '@france-tycoon/shared';
import L from 'leaflet';
import { type Vue, vueDeZone } from './vues.ts';

/** Zoom maximal quand on vole vers une petite commune (au-delà, on ne voit plus ses voisines). */
const ZOOM_MAX_COMMUNE = 14;
const DUREE_VOL = 1.2;

export const versLimites = ([ouest, sud, est, nord]: BoiteCarte) => L.latLngBounds([sud, ouest], [nord, est]);

/** Libère la carte avant un vol : sinon les limites de la zone quittée bloquent le trajet. */
function liberer(carte: L.Map) {
  carte.setMaxBounds(null as unknown as L.LatLngBounds);
  carte.setMinZoom(2);
}

/** Applique les limites d'une zone : on ne peut plus glisser jusqu'en Espagne, ni dézoomer sur le monde. */
export function verrouiller(carte: L.Map, vue: Vue) {
  const limites = versLimites(vueDeZone(vue.zone).bbox);
  carte.setMaxBounds(limites.pad(0.3));
  carte.setMinZoom(Math.max(2, carte.getBoundsZoom(limites) - 1));
}

/** Sur téléphone, la fiche couvre le bas de l'écran : on vise plus bas pour garder la commune visible au-dessus. */
function viser(carte: L.Map, centre: L.LatLngExpression, zoom: number) {
  if (!window.matchMedia('(width < 48rem)').matches) return centre;
  return carte.unproject(carte.project(centre, zoom).add([0, carte.getSize().y / 4]), zoom);
}

export function allerVersVue(carte: L.Map, vue: Vue) {
  liberer(carte);
  carte.once('moveend', () => verrouiller(carte, vue));
  carte.flyToBounds(versLimites(vue.bbox), { padding: [24, 24], duration: DUREE_VOL });
}

/** Vole vers une commune trouvée, assez près pour voir les contours des communes (zoom ≥ 9). */
export function allerVersCommune(carte: L.Map, commune: ResultatRecherche) {
  const limites = versLimites(commune.bbox);
  const zoom = Math.min(
    ZOOM_MAX_COMMUNE,
    Math.max(ZOOM_MIN_COMMUNES, carte.getBoundsZoom(limites, false, L.point(48, 48))),
  );
  liberer(carte);
  carte.once('moveend', () => verrouiller(carte, vueDeZone(commune.zone)));
  carte.flyTo(viser(carte, limites.getCenter(), zoom), zoom, { duration: DUREE_VOL });
}

/** Vole vers le centre d'une commune (liste « Mes territoires ») ; on garde le zoom s'il est déjà proche. */
export function allerVersCentre(carte: L.Map, centre: { lat: number; lng: number }, zone: ZoneCode) {
  const zoom = Math.min(ZOOM_MAX_COMMUNE, Math.max(ZOOM_MIN_COMMUNES + 2, carte.getZoom()));
  liberer(carte);
  carte.once('moveend', () => verrouiller(carte, vueDeZone(zone)));
  carte.flyTo(viser(carte, [centre.lat, centre.lng], zoom), zoom, { duration: DUREE_VOL });
}
