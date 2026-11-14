import type { Map as MapboxMap } from 'mapbox-gl';
import { MotionTrack } from './motion';

/**
 * Per-frame positions shared between the marker layer (which animates them)
 * and the navigation camera (which follows them). Kept outside React state so
 * 60 fps updates never trigger re-renders.
 */
export const liveTracks = {
  self: new MotionTrack(),
  riders: new Map<string, MotionTrack>(),
};

let activeMap: MapboxMap | null = null;

export function setActiveMap(map: MapboxMap | null) {
  activeMap = map;
  // Handy for poking at the map from the browser console during development
  if (import.meta.env.DEV) (window as unknown as { __lrMap?: MapboxMap | null }).__lrMap = map;
}

export function getActiveMap(): MapboxMap | null {
  return activeMap;
}

export function resetLiveTracks() {
  liveTracks.self = new MotionTrack();
  liveTracks.riders.clear();
}
