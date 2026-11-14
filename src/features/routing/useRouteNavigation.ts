import { useCallback, useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { MapboxDirectionsService } from './mapboxDirections';
import { computeProgress, prepareRoute, PreparedRoute } from './routeProgress';

const MIN_REROUTE_INTERVAL_MS = 12000;
const OFF_ROUTE_FIXES_BEFORE_REROUTE = 3;
/** Don't plan from a coarse network fix — wait for a usable GPS position. */
const MAX_START_ACCURACY_METERS = 150;

/**
 * Owns the shared-destination route: fetches it once, tracks progress on every
 * GPS fix (remaining distance, ETA, next turn) and only asks the Directions API
 * again when the rider has clearly left the route.
 */
export function useRouteNavigation() {
  const destination = useRideStore((s) => s.destination);
  const vehicleMode = useRideStore((s) => s.currentRide?.vehicle_mode ?? 'driving');
  const setRoute = useRideStore((s) => s.setRoute);
  const setRouteProgress = useRideStore((s) => s.setRouteProgress);
  const userLocation = useMapStore((s) => s.userLocation);
  const hasUsableLocation = !!userLocation && userLocation.accuracy <= MAX_START_ACCURACY_METERS;

  const preparedRef = useRef<PreparedRoute | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestAtRef = useRef(0);
  const offRouteCountRef = useRef(0);
  const hintRef = useRef<number | null>(null);

  const fetchRoute = useCallback(async () => {
    const loc = useMapStore.getState().userLocation;
    const dest = useRideStore.getState().destination;
    if (!loc || !dest) return;

    const requestId = ++requestIdRef.current;
    lastRequestAtRef.current = Date.now();
    offRouteCountRef.current = 0;

    try {
      const result = await MapboxDirectionsService.getRoute(loc.lng, loc.lat, dest.lng, dest.lat, vehicleMode);
      if (requestId !== requestIdRef.current) return; // superseded
      const prepared = result ? prepareRoute(result) : null;
      preparedRef.current = prepared;
      hintRef.current = null;
      setRoute(result);

      // Show progress on the new line right away instead of waiting for the next fix
      const latest = useMapStore.getState().userLocation;
      if (prepared && latest) {
        const progress = computeProgress(prepared, latest.lng, latest.lat, null);
        if (progress) hintRef.current = progress.segmentIndex;
        useRideStore.getState().setRouteProgress(progress);
      }
    } catch (err) {
      console.warn('Failed to calculate directions:', err);
    }
  }, [vehicleMode, setRoute]);

  // (Re)plan when the destination or travel mode changes, once we know where we are.
  useEffect(() => {
    if (!destination) {
      requestIdRef.current++;
      preparedRef.current = null;
      setRoute(null);
      return;
    }
    if (!hasUsableLocation) return;
    fetchRoute();
  }, [destination?.lat, destination?.lng, vehicleMode, hasUsableLocation, fetchRoute, setRoute]);

  // Track progress on every fix; reroute only when clearly off the line.
  useEffect(() => {
    const prep = preparedRef.current;
    if (!prep || !userLocation) return;

    const progress = computeProgress(prep, userLocation.lng, userLocation.lat, hintRef.current);
    if (!progress) return;
    hintRef.current = progress.segmentIndex;
    setRouteProgress(progress);

    const threshold = Math.max(40, userLocation.accuracy * 1.5);
    if (progress.offRouteMeters > threshold && !progress.arrived) {
      offRouteCountRef.current += 1;
      if (
        offRouteCountRef.current >= OFF_ROUTE_FIXES_BEFORE_REROUTE &&
        Date.now() - lastRequestAtRef.current > MIN_REROUTE_INTERVAL_MS
      ) {
        fetchRoute();
      }
    } else {
      offRouteCountRef.current = 0;
    }
  }, [userLocation, fetchRoute, setRouteProgress]);
}
