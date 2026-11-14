import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import type { LightPreset } from '@/lib/sun';
import type { MapType } from '@/stores/mapStore';

/**
 * All custom sources & layers, added once in a fixed draw order (bottom → top):
 * pathways highlight → breadcrumb trails → follow route → shared route → destination.
 * They live in the basemap's "middle" slot: above roads, below labels and 3D buildings.
 */

const SLOT = 'middle';

export const SOURCE = {
  streets: 'lr-streets',
  trails: 'lr-trails',
  follow: 'lr-follow-route',
  route: 'lr-route',
  routeExtras: 'lr-route-extras',
} as const;

export const LAYER = {
  roadQuery: 'lr-road-query',
  tracks: 'lr-tracks',
  paths: 'lr-paths',
  trails: 'lr-trails',
  followCasing: 'lr-follow-casing',
  follow: 'lr-follow',
  routeCasing: 'lr-route-casing',
  route: 'lr-route',
  connector: 'lr-route-connector',
  destination: 'lr-destination',
} as const;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Small paths that the lite basemap tiles draw faintly or not at all. */
const PATH_CLASSES = ['path', 'pedestrian'];
/** Sidewalks along city streets would only add clutter. */
const HIDDEN_PATH_TYPES = ['sidewalk', 'crossing', 'corridor'];

function addGeoJson(map: MapboxMap, id: string, lineMetrics = false) {
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'geojson', data: EMPTY, lineMetrics });
  }
}

function addLayer(map: MapboxMap, layer: Parameters<MapboxMap['addLayer']>[0]) {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

/** Idempotent: safe to call on every style.load. */
export function ensureCustomLayers(map: MapboxMap) {
  if (!map.getSource(SOURCE.streets)) {
    // Full-detail Mapbox Streets road network (the Standard basemap ships a "lite" variant)
    map.addSource(SOURCE.streets, { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
  }
  addGeoJson(map, SOURCE.trails);
  addGeoJson(map, SOURCE.follow);
  addGeoJson(map, SOURCE.route, true);
  addGeoJson(map, SOURCE.routeExtras);

  // Invisible copy of every road & path, used to read the name of whatever the rider is on
  addLayer(map, {
    id: LAYER.roadQuery,
    type: 'line',
    slot: SLOT,
    source: SOURCE.streets,
    'source-layer': 'road',
    minzoom: 13,
    filter: [
      'all',
      ['==', ['geometry-type'], 'LineString'],
      ['!', ['match', ['get', 'class'], ['ferry', 'golf', 'aerialway', 'major_rail', 'minor_rail', 'service_rail'], true, false]],
    ],
    paint: { 'line-opacity': 0, 'line-width': 4 },
  } as Parameters<MapboxMap['addLayer']>[0]);

  const widthByZoom = (z13: number, z16: number, z18: number) =>
    ['interpolate', ['exponential', 1.6], ['zoom'], 13, z13, 16, z16, 18, z18, 20, z18 * 1.8];

  // Off-road tracks (dirt roads, farm & forest tracks): dashed amber
  addLayer(map, {
    id: LAYER.tracks,
    type: 'line',
    slot: SLOT,
    source: SOURCE.streets,
    'source-layer': 'road',
    minzoom: 12.5,
    filter: ['==', ['get', 'class'], 'track'],
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#f59e0b',
      'line-width': widthByZoom(1.1, 2.6, 4.5),
      'line-dasharray': [2.4, 1.2],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.5, 0.9],
    },
  } as Parameters<MapboxMap['addLayer']>[0]);

  // Footpaths, trails, alleys, stairs: fine dotted line
  addLayer(map, {
    id: LAYER.paths,
    type: 'line',
    slot: SLOT,
    source: SOURCE.streets,
    'source-layer': 'road',
    minzoom: 13.5,
    filter: [
      'all',
      ['match', ['get', 'class'], PATH_CLASSES, true, false],
      ['!', ['match', ['get', 'type'], HIDDEN_PATH_TYPES, true, false]],
    ],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#e2e8f0',
      'line-width': widthByZoom(0.8, 1.8, 3.2),
      'line-dasharray': [0.6, 1.6],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 0.85],
    },
  } as Parameters<MapboxMap['addLayer']>[0]);

  // Breadcrumb trails, coloured per rider
  addLayer(map, {
    id: LAYER.trails,
    type: 'line',
    slot: SLOT,
    source: SOURCE.trails,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4, 19, 7],
      'line-opacity': ['coalesce', ['get', 'opacity'], 0.5],
      'line-blur': 0.4,
    },
  } as Parameters<MapboxMap['addLayer']>[0]);

  // Path to a followed rider: dashed purple
  addLayer(map, {
    id: LAYER.followCasing,
    type: 'line',
    slot: SLOT,
    source: SOURCE.follow,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#3b0764',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 9, 19, 14],
      'line-opacity': 0.55,
    },
  } as Parameters<MapboxMap['addLayer']>[0]);
  addLayer(map, {
    id: LAYER.follow,
    type: 'line',
    slot: SLOT,
    source: SOURCE.follow,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#c084fc',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 5, 19, 8],
      'line-dasharray': [1.5, 1.5],
    },
  } as Parameters<MapboxMap['addLayer']>[0]);

  // Shared destination route — the part already ridden is trimmed away
  addLayer(map, {
    id: LAYER.routeCasing,
    type: 'line',
    slot: SLOT,
    source: SOURCE.route,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#065f46',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 9, 17, 15, 20, 26],
      'line-opacity': 0.9,
      'line-trim-offset': [0, 0],
    },
  } as Parameters<MapboxMap['addLayer']>[0]);
  addLayer(map, {
    id: LAYER.route,
    type: 'line',
    slot: SLOT,
    source: SOURCE.route,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#10b981',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 6, 17, 10, 20, 18],
      'line-trim-offset': [0, 0],
    },
  } as Parameters<MapboxMap['addLayer']>[0]);

  // Last stretch from where the road ends to the actual pin (trailheads, inner alleys)
  addLayer(map, {
    id: LAYER.connector,
    type: 'line',
    slot: SLOT,
    source: SOURCE.routeExtras,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-emissive-strength': 1,
      'line-color': '#34d399',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 4, 19, 6],
      'line-dasharray': [0.1, 1.8],
    },
  } as Parameters<MapboxMap['addLayer']>[0]);

  addLayer(map, {
    id: LAYER.destination,
    type: 'circle',
    slot: 'top',
    source: SOURCE.routeExtras,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-emissive-strength': 1,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7, 19, 9],
      'circle-color': '#ffffff',
      'circle-stroke-color': '#e11d48',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 4],
      'circle-pitch-alignment': 'map',
    },
  } as Parameters<MapboxMap['addLayer']>[0]);
}

export function setSourceData(map: MapboxMap, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  source?.setData(data);
}

export function setLayerVisible(map: MapboxMap, ids: string[], visible: boolean) {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Retunes overlay colours so pathways read clearly on day, night and satellite imagery. */
export function applyOverlayTheme(map: MapboxMap, mapType: MapType, preset: LightPreset) {
  const dark = preset === 'night' || preset === 'dusk';
  const palette =
    mapType === 'satellite'
      ? { track: '#fcd34d', path: '#ffffff', pathOpacity: 0.95 }
      : dark
      ? { track: '#fbbf24', path: '#cbd5e1', pathOpacity: 0.85 }
      : { track: '#b45309', path: '#475569', pathOpacity: 0.9 };

  if (map.getLayer(LAYER.tracks)) map.setPaintProperty(LAYER.tracks, 'line-color', palette.track);
  if (map.getLayer(LAYER.paths)) {
    map.setPaintProperty(LAYER.paths, 'line-color', palette.path);
    map.setPaintProperty(LAYER.paths, 'line-opacity', [
      'interpolate',
      ['linear'],
      ['zoom'],
      13.5,
      0,
      14.5,
      palette.pathOpacity,
    ]);
  }
}

/** Hides the part of the route already travelled (0..1 along the line). */
export function setRouteProgress(map: MapboxMap, fraction: number) {
  const f = Math.max(0, Math.min(0.9999, fraction));
  for (const id of [LAYER.route, LAYER.routeCasing]) {
    if (map.getLayer(id)) map.setPaintProperty(id, 'line-trim-offset', [0, f]);
  }
}
