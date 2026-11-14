import { cumulativeDistances, distanceMeters, LngLat, projectOntoLine } from '@/lib/geo';
import { RouteResult, RouteStep } from './mapboxDirections';

export interface PreparedRoute {
  route: RouteResult;
  coords: LngLat[];
  cumulative: number[];
  /** Length of the drawn polyline in metres. */
  length: number;
  /** Distance along the polyline where each step's maneuver happens. */
  stepStarts: number[];
}

export interface RouteProgress {
  /** 0..1 of the route already ridden — drives the "vanishing" route line. */
  fraction: number;
  remainingMeters: number;
  remainingSeconds: number;
  /** How far the rider is from the route line. */
  offRouteMeters: number;
  segmentIndex: number;
  nextStep: RouteStep | null;
  distanceToNextStep: number | null;
  /** The maneuver after the next one, shown as "Then …" when they come close together. */
  followingStep: RouteStep | null;
  arrived: boolean;
}

export function prepareRoute(route: RouteResult): PreparedRoute {
  const coords = route.geometry.coordinates;
  const cumulative = cumulativeDistances(coords);
  const length = cumulative[cumulative.length - 1] || 0;

  // Step distances come from the API; scale them onto the drawn polyline so they line up.
  const apiTotal = route.steps.reduce((sum, s) => sum + s.distance, 0);
  const scale = apiTotal > 0 && length > 0 ? length / apiTotal : 1;
  let acc = 0;
  const stepStarts = route.steps.map((s) => {
    const start = acc;
    acc += s.distance * scale;
    return start;
  });

  return { route, coords, cumulative, length, stepStarts };
}

const ARRIVAL_METERS = 25;

export function computeProgress(
  prep: PreparedRoute,
  lng: number,
  lat: number,
  hintSegment: number | null
): RouteProgress | null {
  if (prep.coords.length < 2 || prep.length <= 0) return null;
  const p: LngLat = [lng, lat];

  // Search near the last matched segment first so switchbacks and loops don't confuse progress.
  let proj = hintSegment !== null ? projectOntoLine(prep.coords, p, hintSegment - 20, hintSegment + 150) : null;
  if (!proj || proj.distance > 50) {
    const global = projectOntoLine(prep.coords, p);
    if (global && (!proj || global.distance < proj.distance - 5)) proj = global;
  }
  if (!proj) return null;

  const segLen = prep.cumulative[proj.index + 1] - prep.cumulative[proj.index];
  const along = prep.cumulative[proj.index] + segLen * proj.t;
  const remainingMeters = Math.max(0, prep.length - along);

  // Remaining time: rest of the current step plus all later steps
  const steps = prep.route.steps;
  let remainingSeconds = prep.route.durationSeconds * (remainingMeters / prep.length);
  let nextIndex: number | null = null;
  if (steps.length > 1) {
    let current = 0;
    for (let i = 0; i < steps.length; i++) {
      if (prep.stepStarts[i] <= along) current = i;
      else break;
    }
    const currentEnd = current + 1 < steps.length ? prep.stepStarts[current + 1] : prep.length;
    const currentLen = Math.max(1, currentEnd - prep.stepStarts[current]);
    remainingSeconds = steps[current].duration * Math.max(0, (currentEnd - along) / currentLen);
    for (let i = current + 1; i < steps.length; i++) remainingSeconds += steps[i].duration;
    nextIndex = current + 1 < steps.length ? current + 1 : null;
  }

  const [destLng, destLat] = prep.route.destination;
  const [endLng, endLat] = prep.route.routeEnd;
  const toDestination = distanceMeters(lat, lng, destLat, destLng);
  // The last stretch past the end of the road (dashed connector) still counts
  const connector = distanceMeters(endLat, endLng, destLat, destLng);
  const arrived = toDestination < ARRIVAL_METERS || (remainingMeters + connector < ARRIVAL_METERS && proj.distance < 40);

  return {
    fraction: along / prep.length,
    remainingMeters: remainingMeters + connector,
    remainingSeconds: Math.max(0, remainingSeconds),
    offRouteMeters: proj.distance,
    segmentIndex: proj.index,
    nextStep: nextIndex !== null ? steps[nextIndex] : null,
    distanceToNextStep: nextIndex !== null ? Math.max(0, prep.stepStarts[nextIndex] - along) : null,
    followingStep: nextIndex !== null && nextIndex + 1 < steps.length ? steps[nextIndex + 1] : null,
    arrived,
  };
}
