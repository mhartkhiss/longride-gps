import { GpsLocation } from './locationTypes';
import { bearingDegrees, distanceMeters, offsetPoint, smoothingFactor } from '@/lib/geo';

interface RawSample {
  lat: number;
  lng: number;
  t: number;
}

/**
 * Cleans raw browser GPS fixes so a rider's position stays precise and steady
 * everywhere — highways, inner-barangay alleys and unmapped off-road trails.
 *
 * - Never snaps to roads: the true position is kept even where no road is mapped.
 * - Accuracy-weighted (Kalman-style) blending removes the wander you get when
 *   stopped between houses or under trees.
 * - When the device reports Doppler speed + course, the estimate is predicted
 *   forward first, so the smoothing adds no lag while riding.
 * - Rejects multipath "jumps" that would imply impossible speeds.
 * - Derives speed and heading from motion when the browser doesn't supply them.
 */
export class GpsFilter {
  private lat = 0;
  private lng = 0;
  /** Estimate variance in m². Negative means "no estimate yet". */
  private variance = -1;
  private lastTimestamp = 0;
  private lastOutput: GpsLocation | null = null;
  private rejectedInARow = 0;
  private headingAnchor: { lat: number; lng: number } | null = null;
  private heading: number | null = null;
  private derivedSpeed = 0;
  private smoothedAccuracy = 0;
  private rawHistory: RawSample[] = [];

  reset(): void {
    this.variance = -1;
    this.lastTimestamp = 0;
    this.lastOutput = null;
    this.rejectedInARow = 0;
    this.headingAnchor = null;
    this.heading = null;
    this.derivedSpeed = 0;
    this.smoothedAccuracy = 0;
    this.rawHistory = [];
  }

  /** Returns the cleaned fix, or null when the raw fix was a duplicate or an outlier. */
  process(raw: GpsLocation): GpsLocation | null {
    const accuracy = Math.max(raw.accuracy, 2);

    if (this.variance < 0 || !this.lastOutput) {
      return this.seed(raw, accuracy);
    }

    const dtSec = (raw.timestamp - this.lastTimestamp) / 1000;
    if (dtSec <= 0) return null; // duplicate or out-of-order fix

    this.pushRaw(raw);
    const knownSpeed = raw.speed ?? this.baselineSpeed();

    // 1. Outlier rejection — a reflection off a building can throw a fix 100 m+ away.
    const jump = distanceMeters(this.lat, this.lng, raw.lat, raw.lng);
    const plausibleSpeed = Math.max(45, knownSpeed * 2 + 15); // m/s
    const errorBudget = accuracy + Math.sqrt(this.variance) + 10;
    if (dtSec < 20 && jump > errorBudget && jump / dtSec > plausibleSpeed) {
      this.rejectedInARow += 1;
      if (this.rejectedInARow < 4) return null;
      // The receiver keeps disagreeing — believe it (tunnel exit, resumed after sleep).
      return this.seed(raw, accuracy);
    }
    this.rejectedInARow = 0;

    // 2. Predict. Doppler speed/course stay accurate even when the position is noisy.
    const hasDoppler = raw.speed !== null && raw.heading !== null && raw.speed > 0.5;
    if (hasDoppler) {
      const p = offsetPoint(this.lat, this.lng, raw.heading as number, (raw.speed as number) * Math.min(dtSec, 3));
      this.lat = p.lat;
      this.lng = p.lng;
    }
    const processNoise = hasDoppler
      ? Math.max(1.5, (raw.speed as number) * 0.5)
      : Math.max(1.5, knownSpeed * 2.5);
    this.variance += Math.min(dtSec, 30) * processNoise * processNoise;

    // 3. Update — weight the new fix by how much we trust it versus our estimate.
    const gain = this.variance / (this.variance + accuracy * accuracy);
    this.lat += gain * (raw.lat - this.lat);
    this.lng += gain * (raw.lng - this.lng);
    this.variance = (1 - gain) * this.variance;

    // 4. Derived motion for devices that don't report speed / heading.
    const prev = this.lastOutput;
    const moved = distanceMeters(prev.lat, prev.lng, this.lat, this.lng);
    const instSpeed = moved / dtSec;
    this.derivedSpeed += (instSpeed - this.derivedSpeed) * smoothingFactor(dtSec * 1000, 2000);

    const speed = raw.speed ?? (this.derivedSpeed < 0.4 ? 0 : this.derivedSpeed);
    this.updateHeading(raw, speed, accuracy);
    this.smoothedAccuracy += (raw.accuracy - this.smoothedAccuracy) * smoothingFactor(dtSec * 1000, 1500);
    this.lastTimestamp = raw.timestamp;

    return this.emit(raw, speed);
  }

  private seed(raw: GpsLocation, accuracy: number): GpsLocation {
    this.lat = raw.lat;
    this.lng = raw.lng;
    this.variance = accuracy * accuracy;
    this.lastTimestamp = raw.timestamp;
    this.rejectedInARow = 0;
    this.headingAnchor = { lat: raw.lat, lng: raw.lng };
    if (raw.heading !== null) this.heading = raw.heading;
    this.derivedSpeed = raw.speed ?? 0;
    this.smoothedAccuracy = raw.accuracy;
    this.rawHistory = [{ lat: raw.lat, lng: raw.lng, t: raw.timestamp }];
    return this.emit(raw, raw.speed ?? 0);
  }

  private emit(raw: GpsLocation, speed: number): GpsLocation {
    const out: GpsLocation = {
      lat: this.lat,
      lng: this.lng,
      accuracy: Math.round(this.smoothedAccuracy * 10) / 10,
      heading: this.heading,
      speed,
      altitude: raw.altitude,
      timestamp: raw.timestamp,
    };
    this.lastOutput = out;
    return out;
  }

  private updateHeading(raw: GpsLocation, speed: number, accuracy: number): void {
    // Device course is Doppler-derived and reliable once actually moving.
    if (raw.heading !== null && speed > 1.0) {
      this.heading = raw.heading;
      this.headingAnchor = { lat: this.lat, lng: this.lng };
      return;
    }

    if (!this.headingAnchor) {
      this.headingAnchor = { lat: this.lat, lng: this.lng };
      return;
    }

    // Otherwise derive course from our own track once we've clearly moved past the noise.
    const d = distanceMeters(this.headingAnchor.lat, this.headingAnchor.lng, this.lat, this.lng);
    const threshold = Math.max(4, Math.min(accuracy, 30) * 0.6);
    if (d >= threshold) {
      if (speed > 0.8) {
        this.heading = bearingDegrees(this.headingAnchor.lat, this.headingAnchor.lng, this.lat, this.lng);
      }
      this.headingAnchor = { lat: this.lat, lng: this.lng };
    }
  }

  private pushRaw(raw: GpsLocation): void {
    this.rawHistory.push({ lat: raw.lat, lng: raw.lng, t: raw.timestamp });
    const cutoff = raw.timestamp - 10000;
    while (this.rawHistory.length > 2 && this.rawHistory[0].t < cutoff) {
      this.rawHistory.shift();
    }
  }

  /** Speed over a multi-second baseline of raw fixes — robust to per-fix noise. */
  private baselineSpeed(): number {
    const h = this.rawHistory;
    if (h.length < 2) return this.derivedSpeed;
    const newest = h[h.length - 1];
    const oldest = h[0];
    const dt = (newest.t - oldest.t) / 1000;
    if (dt < 2) return this.derivedSpeed;
    return distanceMeters(oldest.lat, oldest.lng, newest.lat, newest.lng) / dt;
  }
}
