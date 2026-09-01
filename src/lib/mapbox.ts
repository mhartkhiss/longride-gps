import mapboxgl from 'mapbox-gl';
import { env, hasValidMapboxConfig } from './env';

if (hasValidMapboxConfig) {
  mapboxgl.accessToken = env.mapboxToken;
}

export const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  navigationDark: 'mapbox://styles/mapbox/navigation-night-v1',
  streets: 'mapbox://styles/mapbox/streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
};

export const DEFAULT_MAP_CENTER: [number, number] = [120.9842, 14.5995]; // Default Manila/Cebu coordinate area
export const DEFAULT_ZOOM = 14;

export { mapboxgl };
