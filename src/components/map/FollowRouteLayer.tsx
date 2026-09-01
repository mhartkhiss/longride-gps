import { useEffect, useState, useRef } from 'react';
import type { Map as MapboxMap, GeoJSONSource } from 'mapbox-gl';
import { GpsLocation } from '@/features/location/locationTypes';
import { LocationBroadcastPayload } from '@/types/realtime';
import { MapboxDirectionsService, RouteResult } from '@/features/routing/mapboxDirections';
import { VehicleMode } from '@/types/database';

interface FollowRouteLayerProps {
  map: MapboxMap | null;
  userLocation: GpsLocation | null;
  followingUserId: string | null;
  riderLocations: Record<string, LocationBroadcastPayload>;
  vehicleMode?: VehicleMode;
}

const FOLLOW_ROUTE_SOURCE_ID = 'follow-route-source';
const FOLLOW_ROUTE_LAYER_ID = 'follow-route-line';
const FOLLOW_ROUTE_CASING_ID = 'follow-route-casing';

export const FollowRouteLayer: React.FC<FollowRouteLayerProps> = ({
  map,
  userLocation,
  followingUserId,
  riderLocations,
  vehicleMode = 'driving',
}) => {
  const [followRoute, setFollowRoute] = useState<RouteResult | null>(null);
  const lastCalculationRef = useRef<{ userLng: number; userLat: number; targetLng: number; targetLat: number } | null>(null);

  // Recalculate route to followed rider when coordinates change
  useEffect(() => {
    if (!followingUserId || !userLocation) {
      setFollowRoute(null);
      lastCalculationRef.current = null;
      return;
    }

    const targetLoc = riderLocations[followingUserId];
    if (!targetLoc) return;

    // Check if movement is significant enough to warrant re-routing (> 10 meters)
    const last = lastCalculationRef.current;
    if (last) {
      const movedUser = Math.hypot(userLocation.lng - last.userLng, userLocation.lat - last.userLat);
      const movedTarget = Math.hypot(targetLoc.lng - last.targetLng, targetLoc.lat - last.targetLat);
      if (movedUser < 0.0001 && movedTarget < 0.0001) {
        return;
      }
    }

    let isCancelled = false;

    const fetchPath = async () => {
      try {
        const res = await MapboxDirectionsService.getRoute(
          userLocation.lng,
          userLocation.lat,
          targetLoc.lng,
          targetLoc.lat,
          vehicleMode
        );
        if (!isCancelled && res) {
          setFollowRoute(res);
          lastCalculationRef.current = {
            userLng: userLocation.lng,
            userLat: userLocation.lat,
            targetLng: targetLoc.lng,
            targetLat: targetLoc.lat,
          };
        }
      } catch (err) {
        console.warn('Failed to calculate path to followed rider:', err);
      }
    };

    fetchPath();

    return () => {
      isCancelled = true;
    };
  }, [followingUserId, userLocation, riderLocations, vehicleMode]);

  // Render or Update Mapbox Layer
  useEffect(() => {
    if (!map) return;

    const sourceData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: 'FeatureCollection',
      features: followRoute
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: followRoute.geometry,
            },
          ]
        : [],
    };

    const updateOrAddLayer = () => {
      try {
        if (!map || !map.getStyle()) return;
        const existingSource = map.getSource(FOLLOW_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;

        if (existingSource) {
          existingSource.setData(sourceData);
        } else {
          map.addSource(FOLLOW_ROUTE_SOURCE_ID, {
            type: 'geojson',
            data: sourceData,
          });

          // Casing glow layer
          map.addLayer({
            id: FOLLOW_ROUTE_CASING_ID,
            type: 'line',
            source: FOLLOW_ROUTE_SOURCE_ID,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#4c1d95',
              'line-width': 7,
              'line-opacity': 0.7,
            },
          });

          // Main dashed vibrant cyan/purple follow line
          map.addLayer({
            id: FOLLOW_ROUTE_LAYER_ID,
            type: 'line',
            source: FOLLOW_ROUTE_SOURCE_ID,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#a855f7',
              'line-width': 4,
              'line-opacity': 0.95,
              'line-dasharray': [2, 2],
            },
          });
        }
      } catch {
        // Map style in transition
      }
    };

    try {
      if (map.isStyleLoaded()) {
        updateOrAddLayer();
      } else {
        map.once('style.load', updateOrAddLayer);
      }
    } catch {
      // Ignore
    }
  }, [map, followRoute]);

  // Clean up layer and source on unmount
  useEffect(() => {
    return () => {
      try {
        if (map && map.getStyle()) {
          if (map.getLayer(FOLLOW_ROUTE_LAYER_ID)) map.removeLayer(FOLLOW_ROUTE_LAYER_ID);
          if (map.getLayer(FOLLOW_ROUTE_CASING_ID)) map.removeLayer(FOLLOW_ROUTE_CASING_ID);
          if (map.getSource(FOLLOW_ROUTE_SOURCE_ID)) map.removeSource(FOLLOW_ROUTE_SOURCE_ID);
        }
      } catch {
        // Ignore
      }
    };
  }, [map]);

  return null;
};
