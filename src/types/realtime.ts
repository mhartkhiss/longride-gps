export interface LocationBroadcastPayload {
  userId: string;
  displayName: string;
  vehicleType?: string;
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface RouteUpdatedBroadcastPayload {
  routeVersion: number;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationName: string | null;
  vehicleMode: string;
  updatedBy: string;
  timestamp: number;
}

export interface RideEventBroadcastPayload {
  type: 'ride_started' | 'ride_ended' | 'host_changed' | 'rider_kicked' | 'checkpoint_reached';
  message: string;
  userId?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export interface PresenceRiderState {
  userId: string;
  displayName: string;
  isHost: boolean;
  vehicleType: string;
  joinedAt: number;
  onlineAt: number;
  location?: LocationBroadcastPayload;
}
