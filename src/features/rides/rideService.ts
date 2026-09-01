import { supabase } from '@/lib/supabase';
import { Destination, Ride, RideParticipant, RideStatus, VehicleMode, RideMessage } from '@/types/database';
import { AuthService } from '@/features/auth/authService';

export class RideService {
  /**
   * Generates a 6-character room code using database function or client fallback
   */
  static async generateRoomCode(): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('generate_room_code');
      if (!error && data) {
        return data as string;
      }
    } catch {
      // client fallback if RPC not accessible
    }

    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Creates a new ride session and sets the creator as host
   */
  static async createRide(
    name: string,
    vehicleMode: VehicleMode = 'driving',
    displayName: string,
    vehicleType: string = 'motorcycle'
  ): Promise<{ ride: Ride; participant: RideParticipant }> {
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      user = await AuthService.ensureAnonymousSession();
    }
    if (!user) throw new Error('Could not establish rider session. Please check your connection.');

    const roomCode = await this.generateRoomCode();

    // 1. Insert ride record
    const { data: rideData, error: rideError } = await supabase
      .from('rides')
      .insert({
        room_code: roomCode,
        name,
        host_user_id: user.id,
        status: 'waiting',
        vehicle_mode: vehicleMode,
      })
      .select()
      .single();

    if (rideError || !rideData) {
      throw new Error(rideError?.message || 'Failed to create ride');
    }

    // 2. Insert host into participants
    const { data: participantData, error: participantError } = await supabase
      .from('ride_participants')
      .insert({
        ride_id: rideData.id,
        user_id: user.id,
        display_name: displayName,
        vehicle_type: vehicleType,
        is_host: true,
      })
      .select()
      .single();

    if (participantError || !participantData) {
      throw new Error(participantError?.message || 'Failed to register host participant');
    }

    return { ride: rideData as Ride, participant: participantData as RideParticipant };
  }

  /**
   * Finds a ride by 6-character room code
   */
  static async getRideByCode(roomCode: string): Promise<Ride | null> {
    const cleanCode = roomCode.trim().toUpperCase();
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('room_code', cleanCode)
      .neq('status', 'ended')
      .single();

    if (error || !data) return null;
    return data as Ride;
  }

  /**
   * Retrieves a ride by UUID
   */
  static async getRideById(rideId: string): Promise<Ride | null> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .single();

    if (error || !data) return null;
    return data as Ride;
  }

  /**
   * Joins a ride as a participant
   */
  static async joinRide(
    rideId: string,
    displayName: string,
    vehicleType: string = 'motorcycle'
  ): Promise<RideParticipant> {
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      user = await AuthService.ensureAnonymousSession();
    }
    if (!user) throw new Error('Could not establish rider session. Please check your connection.');

    const { data, error } = await supabase
      .from('ride_participants')
      .upsert(
        {
          ride_id: rideId,
          user_id: user.id,
          display_name: displayName,
          vehicle_type: vehicleType,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'ride_id,user_id' }
      )
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to join ride');
    }

    return data as RideParticipant;
  }

  /**
   * Fetches all participants for a ride
   */
  static async getParticipants(rideId: string): Promise<RideParticipant[]> {
    const { data, error } = await supabase
      .from('ride_participants')
      .select('*')
      .eq('ride_id', rideId)
      .order('joined_at', { ascending: true });

    if (error || !data) return [];
    return data as RideParticipant[];
  }

  /**
   * Host updates destination and increments route_version
   */
  static async updateDestination(
    rideId: string,
    destination: Destination | null
  ): Promise<Ride> {
    const ride = await this.getRideById(rideId);
    const newVersion = (ride?.route_version || 0) + 1;

    const { data, error } = await supabase
      .from('rides')
      .update({
        destination_lat: destination?.lat ?? null,
        destination_lng: destination?.lng ?? null,
        destination_name: destination?.name ?? null,
        route_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rideId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update destination');
    }

    return data as Ride;
  }

  /**
   * Host updates ride status (e.g. active, ended)
   */
  static async updateStatus(rideId: string, status: RideStatus): Promise<Ride> {
    const { data, error } = await supabase
      .from('rides')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rideId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update ride status');
    }

    return data as Ride;
  }

  /**
   * Participant leaves the ride
   */
  static async leaveRide(rideId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('ride_participants')
      .delete()
      .match({ ride_id: rideId, user_id: user.id });
  }

  /**
   * Fetches persistent chat messages for a ride
   */
  static async getRideMessages(rideId: string): Promise<RideMessage[]> {
    try {
      const { data, error } = await supabase
        .from('ride_messages')
        .select('*')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error || !data) return [];
      return data as RideMessage[];
    } catch {
      return [];
    }
  }

  /**
   * Persists a chat message in the database
   */
  static async sendRideMessage(
    rideId: string,
    userId: string,
    displayName: string,
    text: string,
    isQuickAlert: boolean = false
  ): Promise<RideMessage | null> {
    try {
      const { data, error } = await supabase
        .from('ride_messages')
        .insert({
          ride_id: rideId,
          user_id: userId,
          display_name: displayName,
          text,
          is_quick_alert: isQuickAlert,
        })
        .select()
        .single();

      if (error || !data) return null;
      return data as RideMessage;
    } catch {
      return null;
    }
  }
}
