import type { StyleSpecification } from 'mapbox-gl';
import { LightPreset, lightPresetFor } from '@/lib/sun';
import type { MapType, ThemeSetting } from '@/stores/mapStore';

/**
 * The map uses Mapbox Standard (or Standard Satellite) as an *import* inside an
 * otherwise empty root style. Our own layers (route, trails, pathways) live in
 * the root, so switching between map and satellite keeps them in place.
 */

export const BASEMAP_IMPORT_ID = 'basemap';

const BASEMAP_URLS: Record<MapType, string> = {
  standard: 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/standard-satellite',
};

export function resolveLightPreset(theme: ThemeSetting, lat: number | null, lng: number | null): LightPreset {
  if (theme === 'day') return 'day';
  if (theme === 'night') return 'night';
  return lightPresetFor(Date.now(), lat, lng);
}

/** Basemap configuration: maximum on-the-ground detail for riders. */
export function basemapConfig(mapType: MapType, lightPreset: LightPreset, show3d: boolean): Record<string, string | number | boolean> {
  const shared = {
    lightPreset,
    showPlaceLabels: true, // barangay / sitio / city names
    showRoadLabels: true,
    showPointOfInterestLabels: true,
    showTransitLabels: false,
    showPedestrianRoads: true, // footpaths, alleys, stairs
    fuelingStationModePointOfInterestLabels: 'fuel', // gas stations stand out for riders
  };

  if (mapType === 'satellite') {
    return { ...shared, showRoadsAndTransit: true };
  }

  return {
    ...shared,
    show3dObjects: show3d,
    showLandmarkIcons: false,
    showAdminBoundaries: true,
  };
}

export function buildImport(mapType: MapType, lightPreset: LightPreset, show3d: boolean) {
  return {
    id: BASEMAP_IMPORT_ID,
    url: BASEMAP_URLS[mapType],
    config: basemapConfig(mapType, lightPreset, show3d),
  };
}

export function buildRootStyle(mapType: MapType, lightPreset: LightPreset, show3d: boolean): StyleSpecification {
  return {
    version: 8,
    imports: [buildImport(mapType, lightPreset, show3d)],
    sources: {},
    layers: [],
  } as StyleSpecification;
}
