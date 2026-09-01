import { GpsLocation, LocationPermissionState } from './locationTypes';

export type LocationCallback = (location: GpsLocation) => void;
export type ErrorCallback = (error: GeolocationPositionError) => void;

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
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            altitude: pos.coords.altitude,
            timestamp: pos.timestamp || Date.now(),
          });
        },
        (err) => reject(err),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 1000,
        }
      );
    });
  }

  static startWatching(
    onLocation: LocationCallback,
    onError?: ErrorCallback
  ): number | null {
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
      (pos) => {
        onLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      (err) => {
        console.warn('Geolocation watch error:', err.message);
        onError?.(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
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
