import { GpsLocation, LocationPermissionState } from './locationTypes';

export type LocationCallback = (location: GpsLocation) => void;
export type ErrorCallback = (error: GeolocationPositionError) => void;

/**
 * Always ask the GNSS chip for a fresh, high-accuracy fix. Cached fixes
 * (maximumAge > 0) lag behind a moving rider, and a generous timeout lets the
 * receiver re-acquire under tree cover or between houses in dense barangays.
 */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
};

/** Normalises a browser fix: heading/speed come back as NaN or negative on many devices. */
export function toGpsLocation(pos: GeolocationPosition): GpsLocation {
  const { latitude, longitude, accuracy, heading, speed, altitude } = pos.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 999,
    heading: heading !== null && Number.isFinite(heading) && heading >= 0 ? heading % 360 : null,
    speed: speed !== null && Number.isFinite(speed) && speed >= 0 ? speed : null,
    altitude: altitude !== null && Number.isFinite(altitude) ? altitude : null,
    timestamp: pos.timestamp || Date.now(),
  };
}

export class GeolocationService {
  private static watchId: number | null = null;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  static async checkPermission(): Promise<LocationPermissionState> {
    if (!this.isSupported()) return 'unsupported';

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state as LocationPermissionState;
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  }

  static getCurrentPosition(): Promise<GpsLocation> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(toGpsLocation(pos)),
        (err) => reject(err),
        { ...WATCH_OPTIONS, timeout: 15000 }
      );
    });
  }

  static startWatching(onLocation: LocationCallback, onError?: ErrorCallback): number | null {
    if (!this.isSupported()) {
      onError?.({
        code: 2,
        message: 'Geolocation unsupported',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      return null;
    }

    this.stopWatching();

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => onLocation(toGpsLocation(pos)),
      (err) => {
        console.warn('Geolocation watch error:', err.message);
        onError?.(err);
      },
      WATCH_OPTIONS
    );

    return this.watchId;
  }

  static stopWatching(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
