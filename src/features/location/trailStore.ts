import { distanceMeters, LngLat } from '@/lib/geo';

/**
 * Breadcrumb trails for every rider in the ride. Drawing where people actually
 * went makes unmapped pathways and off-road shortcuts visible on the map, and
 * lets the pack follow the leader's exact line.
 */

type Segments = LngLat[][];

const MAX_POINTS_PER_RIDER = 1500;
const MIN_STEP_METERS = 3;
const MAX_ACCURACY_METERS = 60;
/** A jump bigger than this starts a new segment instead of drawing a line through buildings. */
const GAP_METERS = 200;
const SAVE_DELAY_MS = 15000;

const trails = new Map<string, Segments>();
const listeners = new Set<() => void>();
let storageKey: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((fn) => fn());
}

function scheduleSave() {
  if (!storageKey || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, SAVE_DELAY_MS);
}

function persist() {
  if (!storageKey) return;
  try {
    const data: Record<string, Segments> = {};
    trails.forEach((segments, userId) => {
      data[userId] = segments;
    });
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — trails are a convenience, not critical
  }
}

function countPoints(segments: Segments): number {
  return segments.reduce((sum, s) => sum + s.length, 0);
}

export const trailStore = {
  /** Starts a ride session, restoring any trails saved before a refresh. */
  load(rideId: string) {
    this.reset();
    storageKey = `ride_trails_${rideId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, Segments>;
        Object.entries(parsed).forEach(([userId, segments]) => {
          if (Array.isArray(segments)) trails.set(userId, segments.filter((s) => Array.isArray(s) && s.length > 0));
        });
      }
    } catch {
      // Corrupt cache — start fresh
    }
    notify();
  },

  append(userId: string, lng: number, lat: number, accuracy: number) {
    if (!userId || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (accuracy > MAX_ACCURACY_METERS) return;

    const point: LngLat = [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
    let segments = trails.get(userId);
    if (!segments) {
      segments = [[point]];
      trails.set(userId, segments);
      notify();
      scheduleSave();
      return;
    }

    const current = segments[segments.length - 1];
    const last = current[current.length - 1];
    const step = distanceMeters(last[1], last[0], point[1], point[0]);
    if (step < MIN_STEP_METERS) return;

    if (step > GAP_METERS) {
      segments.push([point]);
    } else {
      current.push(point);
    }

    // Drop the oldest points once over budget
    let excess = countPoints(segments) - MAX_POINTS_PER_RIDER;
    while (excess > 0 && segments.length > 0) {
      const first = segments[0];
      if (first.length <= excess) {
        excess -= first.length;
        segments.shift();
      } else {
        first.splice(0, excess);
        excess = 0;
      }
    }

    notify();
    scheduleSave();
  },

  get(): ReadonlyMap<string, Segments> {
    return trails;
  },

  clear(userId?: string) {
    if (userId) trails.delete(userId);
    else trails.clear();
    notify();
    scheduleSave();
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Flushes to storage and forgets the current ride. */
  reset() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      persist();
    }
    trails.clear();
    storageKey = null;
    notify();
  },

  /** Removes the saved trails of a ride that has ended. */
  discard(rideId: string) {
    try {
      localStorage.removeItem(`ride_trails_${rideId}`);
    } catch {
      // ignore
    }
  },
};
