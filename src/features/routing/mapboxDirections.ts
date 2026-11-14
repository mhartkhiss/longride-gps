import { env, hasValidMapboxConfig } from '@/lib/env';
import { calculateDistanceMeters } from '@/lib/utils';
import { VehicleMode } from '@/types/database';

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat][]
}

export interface RouteManeuver {
  /** e.g. turn, depart, arrive, merge, fork, roundabout, end of road */
  type: string;
  /** e.g. left, slight right, uturn, straight */
  modifier?: string;
  location: [number, number];
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  name: string;
  maneuver?: RouteManeuver;
}

export interface RouteResult {
  geometry: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  /** Where the rider actually wants to go (may be off the road network). */
  destination: [number, number];
  /** Where the road network ends closest to the destination. */
  routeEnd: [number, number];
}

function profileFor(vehicleMode: VehicleMode): string {
  if (vehicleMode === 'cycling') return 'cycling';
  if (vehicleMode === 'walking') return 'walking';
  // Live traffic gives realistic ETAs in city traffic
  return 'driving-traffic';
}

function straightLine(
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number,
  speedMps: number,
  label: string
): RouteResult {
  const distance = calculateDistanceMeters(startLat, startLng, endLat, endLng);
  const duration = Math.round(distance / speedMps);
  return {
    geometry: {
      type: 'LineString',
      coordinates: [
        [startLng, startLat],
        [endLng, endLat],
      ],
    },
    distanceMeters: distance,
    durationSeconds: duration,
    steps: [{ instruction: 'Head towards destination', distance, duration, name: label }],
    destination: [endLng, endLat],
    routeEnd: [endLng, endLat],
  };
}

export class MapboxDirectionsService {
  /**
   * Calculates route from start to destination using Mapbox Directions API
   */
  static async getRoute(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number,
    vehicleMode: VehicleMode = 'driving'
  ): Promise<RouteResult | null> {
    const fallbackSpeed = vehicleMode === 'cycling' ? 5.5 : vehicleMode === 'walking' ? 1.4 : 12.0;

    // If no valid Mapbox token is configured, return straight-line navigation fallback
    if (!hasValidMapboxConfig) {
      return straightLine(startLng, startLat, endLng, endLat, fallbackSpeed, 'Direct Path');
    }

    try {
      const params = new URLSearchParams({
        geometries: 'geojson',
        overview: 'full',
        steps: 'true',
        language: 'en',
        access_token: env.mapboxToken,
      });
      const url = `https://api.mapbox.com/directions/v5/mapbox/${profileFor(vehicleMode)}/${startLng},${startLat};${endLng},${endLat}?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Directions API responded with status ${response.status}`);
      }

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) {
        return null;
      }

      const route = data.routes[0];
      const steps: RouteStep[] = [];

      for (const leg of route.legs || []) {
        for (const step of leg.steps || []) {
          steps.push({
            instruction: step.maneuver?.instruction || step.name || 'Proceed',
            distance: step.distance,
            duration: step.duration,
            name: step.name || '',
            maneuver: step.maneuver
              ? {
                  type: step.maneuver.type,
                  modifier: step.maneuver.modifier,
                  location: step.maneuver.location,
                }
              : undefined,
          });
        }
      }

      const coords: [number, number][] = route.geometry.coordinates;
      const lastWaypoint = data.waypoints?.[data.waypoints.length - 1]?.location as [number, number] | undefined;

      return {
        geometry: route.geometry,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        steps,
        destination: [endLng, endLat],
        routeEnd: lastWaypoint || coords[coords.length - 1],
      };
    } catch (err) {
      console.warn('Failed to fetch Mapbox route, falling back to direct line:', err);
      return straightLine(startLng, startLat, endLng, endLat, fallbackSpeed, 'Direct Route');
    }
  }
}
