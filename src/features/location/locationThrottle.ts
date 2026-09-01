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

export class LocationThrottleFilter {
  private lastBroadcastLocation: GpsLocation | null = null;
  private lastBroadcastTime = 0;
  private config: ThrottleConfig;

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_THROTTLE_CONFIG, ...config };
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

    // 3. Check time interval
    const timeSinceLast = now - this.lastBroadcastTime;
    if (timeSinceLast < this.config.minIntervalMs) {
      return false;
    }

    // 4. Check distance moved
    const distanceMoved = calculateDistanceMeters(
      this.lastBroadcastLocation.lat,
      this.lastBroadcastLocation.lng,
      newLoc.lat,
      newLoc.lng
    );

    // 5. Check heading change if moving
    let headingChanged = false;
    if (
      newLoc.heading !== null &&
      this.lastBroadcastLocation.heading !== null
    ) {
      const headingDiff = Math.abs(newLoc.heading - this.lastBroadcastLocation.heading);
      headingChanged = headingDiff >= this.config.minHeadingChangeDeg && headingDiff <= 360 - this.config.minHeadingChangeDeg;
    }

    // Broadcast if moved enough distance OR heading changed significantly while moving
    if (distanceMoved >= this.config.minDistanceMeters || headingChanged || timeSinceLast >= 10000) {
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
