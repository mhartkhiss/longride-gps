export type RideStatus = 'waiting' | 'active' | 'ended';
export type VehicleMode = 'driving' | 'cycling' | 'walking';

export interface Ride {
  id: string;
  room_code: string;
  name: string;
  host_user_id: string;
  status: RideStatus;
  vehicle_mode: VehicleMode;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_name: string | null;
  route_version: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface RideParticipant {
  id: string;
  ride_id: string;
  user_id: string;
  display_name: string;
  vehicle_type: string | null;
  is_host: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface Destination {
  lat: number;
  lng: number;
  name: string;
}

export interface RideMessage {
  id: string;
  ride_id: string;
  user_id: string;
  display_name: string;
  text: string;
  is_quick_alert: boolean;
  created_at: string;
}
