import { env, hasValidMapboxConfig } from '@/lib/env';
import { calculateDistanceMeters } from '@/lib/utils';
import { VehicleMode } from '@/types/database';

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat][]
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  name: string;
}

export interface RouteResult {
  geometry: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
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
    const profile =
      vehicleMode === 'cycling'
        ? 'cycling'
        : vehicleMode === 'walking'
        ? 'walking'
        : 'driving';

    // If no valid Mapbox token is configured, return straight-line navigation fallback
    if (!hasValidMapboxConfig) {
      const distance = calculateDistanceMeters(startLat, startLng, endLat, endLng);
      const estimatedSpeedMps = vehicleMode === 'cycling' ? 5.5 : vehicleMode === 'walking' ? 1.4 : 14.0;
      return {
        geometry: {
          type: 'LineString',
          coordinates: [
            [startLng, startLat],
            [endLng, endLat],
          ],
        },
        distanceMeters: distance,
        durationSeconds: Math.round(distance / estimatedSpeedMps),
        steps: [
          {
            instruction: 'Head towards destination',
            distance,
            duration: Math.round(distance / estimatedSpeedMps),
            name: 'Direct Path',
          },
        ],
      };
    }

    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&overview=full&steps=true&access_token=${env.mapboxToken}`;
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

      if (route.legs && route.legs[0] && route.legs[0].steps) {
        for (const step of route.legs[0].steps) {
          steps.push({
            instruction: step.maneuver?.instruction || step.name || 'Proceed',
            distance: step.distance,
            duration: step.duration,
            name: step.name || '',
          });
        }
      }

      return {
        geometry: route.geometry,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        steps,
      };
    } catch (err) {
      console.warn('Failed to fetch Mapbox route, falling back to direct line:', err);
      const distance = calculateDistanceMeters(startLat, startLng, endLat, endLng);
      return {
        geometry: {
          type: 'LineString',
          coordinates: [
            [startLng, startLat],
            [endLng, endLat],
          ],
        },
        distanceMeters: distance,
        durationSeconds: Math.round(distance / 12),
        steps: [
          {
            instruction: 'Navigate towards destination',
            distance,
            duration: Math.round(distance / 12),
            name: 'Direct Route',
          },
        ],
      };
    }
  }

  /**
   * Geocodes query string to find matching places/addresses
   */
  static async searchPlaces(query: string, proximityLng?: number, proximityLat?: number) {
    if (!query.trim() || !hasValidMapboxConfig) return [];

    try {
      let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        query.trim()
      )}.json?access_token=${env.mapboxToken}&limit=5`;

      if (proximityLng !== undefined && proximityLat !== undefined) {
        url += `&proximity=${proximityLng},${proximityLat}`;
      }

      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.features || []).map((f: { place_name: string; center: [number, number]; id: string }) => ({
        id: f.id,
        name: f.place_name,
        lng: f.center[0],
        lat: f.center[1],
      }));
    } catch (err) {
      console.warn('Geocoding search failed:', err);
      return [];
    }
  }
}
