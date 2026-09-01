export interface GpsLocation {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}

export type LocationPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface LocationState {
  currentLocation: GpsLocation | null;
  permissionState: LocationPermissionState;
  isWatching: boolean;
  isSharing: boolean;
  error: string | null;
  lastBroadcastAt: number | null;
}
