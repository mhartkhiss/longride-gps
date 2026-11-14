import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useMapStore } from '@/stores/mapStore';
import { clamp, distanceMeters, LngLat, metersPerPixel, projectOntoLine } from '@/lib/geo';
import { getActiveMap } from '@/features/map/liveState';
import { LAYER } from '@/features/map/layers';
import { PlaceInfo, reverseGeocode } from './geocoding';

/**
 * "Where am I" for the GTA-style location chip:
 * - the road / path under the rider, read straight from the map tiles every fix
 *   (no API calls, works on unnamed alleys and dirt tracks too)
 * - the barangay + city from reverse geocoding, refreshed as the rider moves on
 */

export interface RoadInfo {
  label: string;
  /** False for unnamed paths, where `label` describes the kind of path. */
  named: boolean;
  offRoad: boolean;
}

interface PlaceState {
  place: PlaceInfo | null;
  road: RoadInfo | null;
  setPlace: (place: PlaceInfo | null) => void;
  setRoad: (road: RoadInfo | null) => void;
  reset: () => void;
}

export const usePlaceStore = create<PlaceState>((set) => ({
  place: null,
  road: null,
  setPlace: (place) => set({ place }),
  setRoad: (road) =>
    set((state) =>
      state.road && road && state.road.label === road.label && state.road.offRoad === road.offRoad ? state : { road }
    ),
  reset: () => set({ place: null, road: null }),
}));

const GEOCODE_MIN_INTERVAL_MS = 45000;
const GEOCODE_MOVE_METERS = 500;
const GEOCODE_REFRESH_MS = 180000;

/** Keeps the barangay / city up to date without spending an API call per fix. */
export function useBarangayTracking() {
  const userLocation = useMapStore((s) => s.userLocation);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const lastRef = useRef<{ lng: number; lat: number; at: number } | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userLocation || userLocation.accuracy > 150 || inFlightRef.current) return;
    const now = Date.now();
    const prev = lastRef.current;
    if (prev) {
      const moved = distanceMeters(prev.lat, prev.lng, userLocation.lat, userLocation.lng);
      const elapsed = now - prev.at;
      if (elapsed < GEOCODE_MIN_INTERVAL_MS) return;
      if (moved < GEOCODE_MOVE_METERS && !(elapsed > GEOCODE_REFRESH_MS && moved > 50)) return;
    }

    inFlightRef.current = true;
    lastRef.current = { lng: userLocation.lng, lat: userLocation.lat, at: now };
    reverseGeocode(userLocation.lng, userLocation.lat)
      .then((place) => {
        if (place) setPlace(place);
      })
      .catch(() => {
        // Retry sooner next time
        if (lastRef.current) lastRef.current.at = now - GEOCODE_MIN_INTERVAL_MS + 10000;
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [userLocation, setPlace]);
}

const PATH_TYPE_LABELS: Record<string, string> = {
  footway: 'Footpath',
  path: 'Trail',
  trail: 'Trail',
  hiking: 'Hiking trail',
  mountain_bike: 'MTB trail',
  cycleway: 'Bike path',
  steps: 'Stairs',
  bridleway: 'Trail',
  'service:alley': 'Alley',
  'service:driveway': 'Driveway',
  'service:parking_aisle': 'Parking lot',
};

const CLASS_LABELS: Record<string, string> = {
  track: 'Dirt track',
  path: 'Trail',
  pedestrian: 'Pedestrian street',
  service: 'Service road',
  street: 'Local road',
  street_limited: 'Local road',
};

function describeRoad(props: Record<string, unknown>): RoadInfo {
  const name = (props.name_en || props.name || props.ref) as string | undefined;
  if (name) return { label: name, named: true, offRoad: false };
  const type = props.type as string | undefined;
  const cls = props.class as string | undefined;
  const label = (type && PATH_TYPE_LABELS[type]) || (cls && CLASS_LABELS[cls]) || 'Unnamed road';
  return { label, named: false, offRoad: false };
}

function nearestRoad(map: MapboxMap, lng: number, lat: number, maxMeters: number): RoadInfo | null {
  // Tiles for the query layer only exist from z13, and only on-screen features can be queried
  if (!map.getLayer(LAYER.roadQuery) || map.getZoom() < 13.5) return null;
  const pt = map.project([lng, lat]);
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (pt.x < 0 || pt.y < 0 || pt.x > width || pt.y > height) return null;
  const box = clamp(maxMeters / metersPerPixel(lat, map.getZoom()), 16, 140);
  const features = map.queryRenderedFeatures(
    [
      [pt.x - box, pt.y - box],
      [pt.x + box, pt.y + box],
    ],
    { layers: [LAYER.roadQuery] }
  );

  let best: { d: number; props: Record<string, unknown> } | null = null;
  for (const f of features) {
    const g = f.geometry;
    const lines: LngLat[][] =
      g.type === 'LineString' ? [g.coordinates as LngLat[]] : g.type === 'MultiLineString' ? (g.coordinates as LngLat[][]) : [];
    for (const line of lines) {
      const proj = projectOntoLine(line, [lng, lat]);
      if (proj && (!best || proj.distance < best.d)) best = { d: proj.distance, props: (f.properties || {}) as Record<string, unknown> };
    }
  }

  if (!best || best.d > maxMeters) return { label: 'Off-road', named: false, offRoad: true };
  return describeRoad(best.props);
}

/** Reads the road / path under the rider from the vector tiles on every fix. */
export function useRoadNameTracking() {
  const userLocation = useMapStore((s) => s.userLocation);
  const setRoad = usePlaceStore((s) => s.setRoad);

  useEffect(() => {
    const map = getActiveMap();
    if (!map || !userLocation) return;
    try {
      const maxMeters = Math.max(22, Math.min(userLocation.accuracy, 45));
      const road = nearestRoad(map, userLocation.lng, userLocation.lat, maxMeters);
      if (road) setRoad(road);
    } catch {
      // Style still loading
    }
  }, [userLocation, setRoad]);
}
