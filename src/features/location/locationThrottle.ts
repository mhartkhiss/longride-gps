import { GpsLocation } from './locationTypes';
import { calculateDistanceMeters } from '@/lib/utils';

export interface ThrottleConfig {
  minIntervalMs: number; // e.g., 1500ms
  minDistanceMeters: number; // e.g., 3 meters
  minHeadingChangeDeg: number; // e.g., 15 degrees
  maxAccuracyMeters: number; // e.g., 60 meters
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  minIntervalMs: 1500,
  minDistanceMeters: 3.0,
  minHeadingChangeDeg: 15.0,
  maxAccuracyMeters: 60.0,
};

export function sanitizeGpsPayload(loc: GpsLocation) {
  return {
    lat: Math.round(loc.lat * 100000) / 100000,
    lng: Math.round(loc.lng * 100000) / 100000,
    accuracy: Math.round(loc.accuracy * 10) / 10,
    heading: loc.heading !== null ? Math.round(loc.heading) : null,
    speed: loc.speed !== null ? Math.round(loc.speed * 10) / 10 : null,
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

    // 1. Basic accuracy check (ignore noisy inaccurate readings)
    if (newLoc.accuracy > this.config.maxAccuracyMeters) {
      return false;
    }

    // 2. If first location ever, broadcast immediately
    if (!this.lastBroadcastLocation) {
      this.lastBroadcastLocation = newLoc;
      this.lastBroadcastTime = now;
      return true;
    }

    const timeSinceLast = now - this.lastBroadcastTime;
    const networkMultiplier = this.getNetworkMultiplier();

    // Check heading change if moving
    let headingChanged = false;
    if (
      newLoc.heading !== null &&
      this.lastBroadcastLocation.heading !== null
    ) {
      const headingDiff = Math.abs(newLoc.heading - this.lastBroadcastLocation.heading);
      headingChanged = headingDiff >= this.config.minHeadingChangeDeg && headingDiff <= 360 - this.config.minHeadingChangeDeg;
    }

    // Speed-adaptive minimum intervals:
    const isStationary = newLoc.speed !== null && newLoc.speed < 0.8; // < ~3 km/h
    let dynamicMinInterval = this.config.minIntervalMs * networkMultiplier;

    if (isStationary) {
      dynamicMinInterval = Math.max(dynamicMinInterval, 8000); // 8s heartbeat when stationary
    } else if (headingChanged) {
      // Cornering / turns: prioritize responsiveness down to 800ms
      dynamicMinInterval = Math.max(800, this.config.minIntervalMs * 0.6);
    }

    // 3. Enforce dynamic interval
    if (timeSinceLast < dynamicMinInterval) {
      return false;
    }

    // 4. Check distance moved
    const distanceMoved = calculateDistanceMeters(
      this.lastBroadcastLocation.lat,
      this.lastBroadcastLocation.lng,
      newLoc.lat,
      newLoc.lng
    );

    const minDistance = isStationary ? 10.0 : this.config.minDistanceMeters;

    // Broadcast if moved enough distance, turning, or keepalive interval expired
    if (distanceMoved >= minDistance || headingChanged || timeSinceLast >= 12000) {
      this.lastBroadcastLocation = newLoc;
      this.lastBroadcastTime = now;
      return true;
    }

    return false;
  }

  reset() {
    this.lastBroadcastLocation = null;
    this.lastBroadcastTime = 0;
  }
}
