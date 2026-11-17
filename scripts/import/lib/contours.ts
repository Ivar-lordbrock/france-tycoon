import type { ZoneCode } from '@france-tycoon/shared';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { feature, merge } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import type {
  GeometryCollection,
  Topology,
  MultiPolygon as TopoMultiPolygon,
  Polygon as TopoPolygon,
} from 'topojson-specification';
import { arrondir, type Surface } from './geometrie.ts';

/** Polygones d'une topologie (les communes et départements ne sont jamais des lignes ni des points). */
type Surfaces = Array<TopoPolygon | TopoMultiPolygon>;

/**
 * Réunit des communes voisines en un seul contour (département, zone).
 * Passe par une topologie : les frontières communes (mêmes points dans les données IGN)
 * disparaissent exactement, sans les fentes qu'une union de polygones simplifiés laisserait.
 */
export function fusionner(surfaces: Surface[]): MultiPolygon {
  const collection: FeatureCollection<Surface> = {
    type: 'FeatureCollection',
    features: surfaces.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
  };
  const topo = topology({ morceaux: collection }) as Topology<{ morceaux: GeometryCollection }>;
  return merge(topo, topo.objects.morceaux.geometries as Surfaces);
}

export interface ContourDepartement {
  code: string;
  nom: string;
  zone: ZoneCode;
  geometrie: Surface;
}

export interface OptionsSimplification {
  /** Aire minimale (degrés²) d'un triangle de Visvalingam pour garder un point. */
  poidsMin: number;
  /** Idem pour le contour des zones (masque gris, visible à tous les zooms) ; par défaut `poidsMin`. */
  poidsMinZones?: number;
  decimales: number;
}

type ProprietesDepartement = { code: string; nom: string; zone: ZoneCode };

/**
 * Contours légers pour les zooms < 9 : départements et contour de chaque zone (masque gris).
 * Simplification topologique par zone : deux départements voisins gardent la même frontière.
 */
export function contoursAlleges(departements: ContourDepartement[], options: OptionsSimplification) {
  const parZone = Map.groupBy(departements, (d) => d.zone);
  const featuresDepartements: Feature<Surface, ProprietesDepartement>[] = [];
  const featuresZones: Feature<Surface, { zone: ZoneCode }>[] = [];

  for (const [zone, liste] of parZone) {
    const collection: FeatureCollection<Surface, ProprietesDepartement> = {
      type: 'FeatureCollection',
      features: liste.map((d) => ({
        type: 'Feature',
        properties: { code: d.code, nom: d.nom, zone: d.zone },
        geometry: d.geometrie,
      })),
    };
    const brute = topology({ departements: collection }, 1e6) as Topology<{ departements: GeometryCollection }>;
    const pondere = presimplify(brute);
    const topo = simplify(pondere, options.poidsMin) as typeof brute;
    const topoZone =
      options.poidsMinZones === undefined ? topo : (simplify(pondere, options.poidsMinZones) as typeof brute);

    const simplifies = feature(topo, topo.objects.departements) as FeatureCollection<Surface, ProprietesDepartement>;
    for (const f of simplifies.features) {
      featuresDepartements.push({ ...f, geometry: arrondir(f.geometry, options.decimales) });
    }
    const contourZone = merge(topoZone, topoZone.objects.departements.geometries as Surfaces);
    featuresZones.push({
      type: 'Feature',
      properties: { zone },
      geometry: arrondir(contourZone, options.decimales),
    });
  }

  featuresDepartements.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  return {
    departements: { type: 'FeatureCollection', features: featuresDepartements } as FeatureCollection<
      Surface,
      ProprietesDepartement
    >,
    zones: { type: 'FeatureCollection', features: featuresZones } as FeatureCollection<Surface, { zone: ZoneCode }>,
  };
}
