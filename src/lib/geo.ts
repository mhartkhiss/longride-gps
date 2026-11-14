/**
 * Geodesy helpers shared by the GPS filter, route progress tracking and the
 * navigation camera. Everything works in degrees / metres.
 */

export type LngLat = [number, number];

const DEG = Math.PI / 180;
const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLng = (bLng - aLng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Initial bearing from A to B in degrees clockwise from north (0..360). */
export function bearingDegrees(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const p1 = aLat * DEG;
  const p2 = bLat * DEG;
  const dl = (bLng - aLng) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normalizeAngle(Math.atan2(y, x) / DEG);
}

/** Moves a point `distance` metres along `bearing` (flat-earth approximation, fine below ~10 km). */
export function offsetPoint(lat: number, lng: number, bearing: number, distance: number): { lat: number; lng: number } {
  const rad = bearing * DEG;
  return {
    lat: lat + (distance * Math.cos(rad)) / 111320,
    lng: lng + (distance * Math.sin(rad)) / (111320 * Math.cos(lat * DEG)),
  };
}

export function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Smallest signed rotation (degrees) that turns `from` into `to`, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Frame-rate independent smoothing factor for an exponential filter with time constant `tauMs`. */
export function smoothingFactor(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  return 1 - Math.exp(-dtMs / tauMs);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Piecewise-linear lookup over sorted [x, y] stops. */
export function interpolateStops(x: number, stops: Array<[number, number]>): number {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, y1] = stops[i];
    if (x <= x1) {
      const [x0, y0] = stops[i - 1];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return stops[stops.length - 1][1];
}

/** Metres covered by one CSS pixel at `zoom` (Mapbox GL uses 512px tiles). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos(lat * DEG)) / (512 * Math.pow(2, zoom));
}

/**
 * Flat-earth projector (cheap-ruler WGS84 coefficients) for fast nearest-segment
 * math over a few kilometres around `refLat`. Returns metres.
 */
export function createLocalProjector(refLat: number) {
  const RE = 6378.137;
  const FE = 1 / 298.257223563;
  const E2 = FE * (2 - FE);
  const m = DEG * RE * 1000;
  const coslat = Math.cos(refLat * DEG);
  const w2 = 1 / (1 - E2 * (1 - coslat * coslat));
  const w = Math.sqrt(w2);
  const kx = m * w * coslat;
  const ky = m * w * w2 * (1 - E2);
  return {
    kx,
    ky,
    /** Squared distance in m² between two lng/lat pairs. */
    dist2(aLng: number, aLat: number, bLng: number, bLat: number): number {
      const dx = (aLng - bLng) * kx;
      const dy = (aLat - bLat) * ky;
      return dx * dx + dy * dy;
    },
  };
}

export interface SegmentProjection {
  /** Index of the segment start vertex. */
  index: number;
  /** 0..1 position along the segment. */
  t: number;
  /** Distance from the point to the line in metres. */
  distance: number;
  /** The closest point on the line. */
  point: LngLat;
}

/**
 * Closest point on the polyline `coords` to `p`, searching segments [from, to).
 * Uses a local projector so it stays cheap enough to run on every GPS fix.
 */
export function projectOntoLine(
  coords: LngLat[],
  p: LngLat,
  from = 0,
  to = coords.length - 1
): SegmentProjection | null {
  if (coords.length < 2) return null;
  const start = clamp(from, 0, coords.length - 2);
  const end = clamp(to, start + 1, coords.length - 1);
  const proj = createLocalProjector(p[1]);
  let best: SegmentProjection | null = null;
  let bestD2 = Infinity;

  for (let i = start; i < end; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const dx = (bx - ax) * proj.kx;
    const dy = (by - ay) * proj.ky;
    const px = (p[0] - ax) * proj.kx;
    const py = (p[1] - ay) * proj.ky;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const ex = px - t * dx;
    const ey = py - t * dy;
    const d2 = ex * ex + ey * ey;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = {
        index: i,
        t,
        distance: Math.sqrt(d2),
        point: [ax + (bx - ax) * t, ay + (by - ay) * t],
      };
    }
  }
  return best;
}

/** Cumulative distance (metres) at every vertex of a polyline. */
export function cumulativeDistances(coords: LngLat[]): number[] {
  const out = new Array<number>(coords.length);
  let total = 0;
  out[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    total += distanceMeters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    out[i] = total;
  }
  return out;
}
