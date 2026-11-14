import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { GpsLocation } from '@/features/location/locationTypes';
import { LocationBroadcastPayload } from '@/types/realtime';
import { MapboxDirectionsService, RouteResult } from '@/features/routing/mapboxDirections';
import { VehicleMode } from '@/types/database';
import { SOURCE, setSourceData } from '@/features/map/layers';
import { distanceMeters } from '@/lib/geo';

interface FollowRouteLayerProps {
  map: MapboxMap | null;
  userLocation: GpsLocation | null;
  followingUserId: string | null;
  riderLocations: Record<string, LocationBroadcastPayload>;
  vehicleMode?: VehicleMode;
}

/** Re-plan the path to a followed rider only when someone has really moved. */
const MIN_INTERVAL_MS = 15000;
const MOVE_THRESHOLD_METERS = 60;

export const FollowRouteLayer: React.FC<FollowRouteLayerProps> = ({
  map,
  userLocation,
  followingUserId,
  riderLocations,
  vehicleMode = 'driving',
}) => {
  const [followRoute, setFollowRoute] = useState<RouteResult | null>(null);
  const lastCalcRef = useRef<{ at: number; user: [number, number]; target: [number, number]; id: string } | null>(null);
  const inFlightRef = useRef(false);
  // Latest followed id, so a late response for a previous target is dropped
  const followIdRef = useRef(followingUserId);
  followIdRef.current = followingUserId;

  const target = followingUserId ? riderLocations[followingUserId] : undefined;

  useEffect(() => {
    if (!followingUserId || !userLocation || !target) {
      if (!followingUserId) {
        setFollowRoute(null);
        lastCalcRef.current = null;
      }
      return;
    }

    const last = lastCalcRef.current;
    if (last && last.id === followingUserId) {
      const movedUser = distanceMeters(last.user[1], last.user[0], userLocation.lat, userLocation.lng);
      const movedTarget = distanceMeters(last.target[1], last.target[0], target.lat, target.lng);
      const elapsed = Date.now() - last.at;
      if (elapsed < MIN_INTERVAL_MS || (movedUser < MOVE_THRESHOLD_METERS && movedTarget < MOVE_THRESHOLD_METERS)) {
        return;
      }
    }
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    const id = followingUserId;
    lastCalcRef.current = {
      at: Date.now(),
      user: [userLocation.lng, userLocation.lat],
      target: [target.lng, target.lat],
      id,
    };

    MapboxDirectionsService.getRoute(userLocation.lng, userLocation.lat, target.lng, target.lat, vehicleMode)
      .then((res) => {
        if (followIdRef.current === id) setFollowRoute(res);
      })
      .catch((err) => console.warn('Failed to calculate path to followed rider:', err))
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [followingUserId, userLocation, target, vehicleMode]);

  useEffect(() => {
    if (!map) return;
    const draw = () => {
      try {
        setSourceData(map, SOURCE.follow, {
          type: 'FeatureCollection',
          features: followRoute && followingUserId ? [{ type: 'Feature', properties: {}, geometry: followRoute.geometry }] : [],
        });
      } catch {
        // Style reloading
      }
    };
    draw();
    map.on('style.load', draw);
    return () => {
      map.off('style.load', draw);
    };
  }, [map, followRoute, followingUserId]);

  return null;
};
