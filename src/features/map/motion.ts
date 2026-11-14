import { angleDelta, clamp, distanceMeters, normalizeAngle, offsetPoint, smoothingFactor } from '@/lib/geo';

export interface MotionFix {
  lng: number;
  lat: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
}

export interface MotionOptions {
  /** Keep moving along the last heading when updates are late (other riders on spotty data). */
  deadReckoning?: boolean;
}

const TELEPORT_METERS = 300;
const MAX_EXTRAPOLATION_MS = 2500;
const MAX_EXTRAPOLATION_METERS = 25;

/**
 * Turns sparse GPS fixes (≈1 Hz) into smooth 60 fps motion. Each new fix starts
 * a constant-speed glide from wherever the marker is drawn now, lasting about one
 * update interval — the same technique Google Maps uses for its blue puck.
 */
export class MotionTrack {
  lng = 0;
  lat = 0;
  /** Smoothed heading in degrees, or null when unknown. */
  heading: number | null = null;
  speed: number | null = null;
  accuracy = 0;
  /** performance.now() of the last fix. */
  lastFixAt = 0;
  initialized = false;

  private fromLng = 0;
  private fromLat = 0;
  private toLng = 0;
  private toLat = 0;
  private glideStart = 0;
  private glideDuration = 0;
  private targetHeading: number | null = null;
  private avgInterval = 1000;
  private readonly deadReckoning: boolean;

  constructor(options: MotionOptions = {}) {
    this.deadReckoning = options.deadReckoning ?? false;
  }

  push(fix: MotionFix, now = performance.now()): void {
    if (!this.initialized) {
      this.lng = this.fromLng = this.toLng = fix.lng;
      this.lat = this.fromLat = this.toLat = fix.lat;
      this.heading = fix.heading;
      this.targetHeading = fix.heading;
      this.speed = fix.speed;
      this.accuracy = fix.accuracy;
      this.lastFixAt = now;
      this.glideDuration = 0;
      this.initialized = true;
      return;
    }

    const interval = now - this.lastFixAt;
    if (interval > 50) {
      this.avgInterval = clamp(this.avgInterval * 0.7 + interval * 0.3, 250, 3000);
    }
    this.lastFixAt = now;

    const jump = distanceMeters(this.lat, this.lng, fix.lat, fix.lng);
    if (jump > TELEPORT_METERS) {
      // Too far to glide believably — jump straight there.
      this.lng = this.fromLng = this.toLng = fix.lng;
      this.lat = this.fromLat = this.toLat = fix.lat;
      this.glideDuration = 0;
    } else {
      this.fromLng = this.lng;
      this.fromLat = this.lat;
      this.toLng = fix.lng;
      this.toLat = fix.lat;
      this.glideStart = now;
      this.glideDuration = this.avgInterval * 1.05;
    }

    if (fix.heading !== null) this.targetHeading = fix.heading;
    this.speed = fix.speed;
    this.accuracy = fix.accuracy;
  }

  /** Advances the animation. Returns true when anything visible changed. */
  step(now: number, dtMs: number): boolean {
    if (!this.initialized) return false;
    const prevLng = this.lng;
    const prevLat = this.lat;
    const prevHeading = this.heading;

    if (this.glideDuration > 0) {
      const t = clamp((now - this.glideStart) / this.glideDuration, 0, 1);
      this.lng = this.fromLng + (this.toLng - this.fromLng) * t;
      this.lat = this.fromLat + (this.toLat - this.fromLat) * t;

      // Late update from another rider: keep them moving instead of freezing mid-corner
      if (t >= 1 && this.deadReckoning && this.heading !== null && (this.speed ?? 0) > 3) {
        const overdue = now - (this.glideStart + this.glideDuration);
        if (overdue > 0) {
          const d = Math.min(((this.speed as number) * Math.min(overdue, MAX_EXTRAPOLATION_MS)) / 1000, MAX_EXTRAPOLATION_METERS);
          const p = offsetPoint(this.toLat, this.toLng, this.heading, d);
          this.lng = p.lng;
          this.lat = p.lat;
        }
      }
    }

    if (this.targetHeading !== null) {
      if (this.heading === null) {
        this.heading = this.targetHeading;
      } else {
        const diff = angleDelta(this.heading, this.targetHeading);
        if (Math.abs(diff) > 0.05) {
          this.heading = normalizeAngle(this.heading + diff * smoothingFactor(dtMs, 220));
        }
      }
    }

    return prevLng !== this.lng || prevLat !== this.lat || prevHeading !== this.heading;
  }
}
