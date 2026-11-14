import { GpsLocation } from './locationTypes';
import { calculateDistanceMeters } from '@/lib/utils';
import { angleDelta } from '@/lib/geo';

export interface ThrottleConfig {
  minIntervalMs: number; // e.g., 1500ms
  minDistanceMeters: number; // e.g., 3 meters
  minHeadingChangeDeg: number; // e.g., 15 degrees
  /** Fixes at or under this accuracy are sent at the normal cadence. */
  goodAccuracyMeters: number;
  /**
   * Weaker fixes (inside dense barangays, under tree cover) are still sent, just
   * less often, so the group never sees a rider frozen at the last main road.
   */
  poorAccuracyIntervalMs: number;
  /** Fixes worse than this carry no useful position and are never sent. */
  maxAccuracyMeters: number;
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  minIntervalMs: 1500,
  minDistanceMeters: 3.0,
  minHeadingChangeDeg: 15.0,
  goodAccuracyMeters: 40,
  poorAccuracyIntervalMs: 6000,
  maxAccuracyMeters: 250,
};

export function sanitizeGpsPayload(loc: GpsLocation) {
  return {
    // 6 decimals ≈ 0.1 m — enough to keep riders on the right side of a narrow trail
    lat: Math.round(loc.lat * 1e6) / 1e6,
    lng: Math.round(loc.lng * 1e6) / 1e6,
    accuracy: Math.round(loc.accuracy * 10) / 10,
    heading: loc.heading !== null && Number.isFinite(loc.heading) ? Math.round(loc.heading) : null,
    speed: loc.speed !== null && Number.isFinite(loc.speed) ? Math.round(loc.speed * 10) / 10 : null,
    timestamp: loc.timestamp,
  };
}

export class LocationThrottleFilter {
  private lastBroadcastLocation: GpsLocation | null = null;
  private lastBroadcastTime = 0;
  private config: ThrottleConfig;

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_THROTTLE_CONFIG, ...config };
  }

  /**
   * Evaluates network quality to adapt broadcast interval on slow 2G/3G connections.
   */
  private getNetworkMultiplier(): number {
    if (typeof navigator === 'undefined') return 1.0;
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
    if (!conn || !conn.effectiveType) return 1.0;

    switch (conn.effectiveType) {
      case 'slow-2g':
      case '2g':
        return 2.5; // Backoff significantly to prevent bufferbloat
      case '3g':
        return 1.4;
      default:
        return 1.0;
    }
  }

  /**
   * Determines whether the new GPS location update should be broadcast over Realtime.
   */
  shouldBroadcast(newLoc: GpsLocation): boolean {
    const now = Date.now();

    // 1. Unusable fixes are never sent
    if (newLoc.accuracy > this.config.maxAccuracyMeters) {
      return false;
    }

    // 2. If first location ever, broadcast immediately
    if (!this.lastBroadcastLocation) {
      this.mark(newLoc, now);
      return true;
    }

    const timeSinceLast = now - this.lastBroadcastTime;
    const networkMultiplier = this.getNetworkMultiplier();

    // 3. Weak-signal fixes go out on a slower cadence instead of being dropped
    if (newLoc.accuracy > this.config.goodAccuracyMeters) {
      if (timeSinceLast < this.config.poorAccuracyIntervalMs * networkMultiplier) return false;
      this.mark(newLoc, now);
      return true;
    }

    // Check heading change if moving
    let headingChanged = false;
    if (newLoc.heading !== null && this.lastBroadcastLocation.heading !== null) {
      headingChanged =
        Math.abs(angleDelta(this.lastBroadcastLocation.heading, newLoc.heading)) >= this.config.minHeadingChangeDeg;
    }

    // Speed-adaptive minimum intervals:
    const isStationary = newLoc.speed !== null && newLoc.speed < 0.8; // < ~3 km/h
    let dynamicMinInterval = this.config.minIntervalMs * networkMultiplier;

    if (isStationary) {
      dynamicMinInterval = Math.max(dynamicMinInterval, 8000); // 8s heartbeat when stationary
    } else if (headingChanged) {
      // Cornering / turns on twisty trails: prioritize responsiveness down to 800ms
      dynamicMinInterval = Math.max(800, this.config.minIntervalMs * 0.6);
    }

    // 4. Enforce dynamic interval
    if (timeSinceLast < dynamicMinInterval) {
      return false;
    }

    // 5. Check distance moved
    const distanceMoved = calculateDistanceMeters(
      this.lastBroadcastLocation.lat,
      this.lastBroadcastLocation.lng,
      newLoc.lat,
      newLoc.lng
    );

    const minDistance = isStationary ? 10.0 : this.config.minDistanceMeters;

    // Broadcast if moved enough distance, turning, or keepalive interval expired
    if (distanceMoved >= minDistance || headingChanged || timeSinceLast >= 12000) {
      this.mark(newLoc, now);
      return true;
    }

    return false;
  }

  private mark(loc: GpsLocation, now: number) {
    this.lastBroadcastLocation = loc;
    this.lastBroadcastTime = now;
  }

  reset() {
    this.lastBroadcastLocation = null;
    this.lastBroadcastTime = 0;
  }
}
