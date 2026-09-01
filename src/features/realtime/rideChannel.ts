import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  LocationBroadcastPayload,
  PresenceRiderState,
  RideEventBroadcastPayload,
  RouteUpdatedBroadcastPayload,
  ChatMessagePayload,
} from '@/types/realtime';

export interface RideChannelHandlers {
  onLocationUpdate?: (payload: LocationBroadcastPayload) => void;
  onRouteChange?: (payload: RouteUpdatedBroadcastPayload) => void;
  onRideEvent?: (payload: RideEventBroadcastPayload) => void;
  onChatMessage?: (payload: ChatMessagePayload) => void;
  onPresenceSync?: (presenceState: Record<string, PresenceRiderState[]>) => void;
  onPresenceJoin?: (key: string, newPresence: PresenceRiderState) => void;
  onPresenceLeave?: (key: string, leftPresence: PresenceRiderState) => void;
  onStatusChange?: (status: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT') => void;
}

export class RideRealtimeChannel {
  private channel: RealtimeChannel | null = null;
  private rideId: string;
  private handlers: RideChannelHandlers;

  constructor(rideId: string, handlers: RideChannelHandlers) {
    this.rideId = rideId;
    this.handlers = handlers;
  }

  /**
   * Initializes and subscribes to the ride's private Realtime channel
   */
  async subscribe(currentUserState: PresenceRiderState): Promise<void> {
    this.unsubscribe();

    const channelName = `ride:${this.rideId}`;
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: currentUserState.userId },
      },
    });

    // 1. Broadcast listeners
    this.channel.on(
      'broadcast',
      { event: 'location' },
      ({ payload }) => {
        this.handlers.onLocationUpdate?.(payload as LocationBroadcastPayload);
      }
    );

    this.channel.on(
      'broadcast',
      { event: 'route-updated' },
      ({ payload }) => {
        this.handlers.onRouteChange?.(payload as RouteUpdatedBroadcastPayload);
      }
    );

    this.channel.on(
      'broadcast',
      { event: 'ride-event' },
      ({ payload }) => {
        this.handlers.onRideEvent?.(payload as RideEventBroadcastPayload);
      }
    );

    this.channel.on(
      'broadcast',
      { event: 'chat' },
      ({ payload }) => {
        this.handlers.onChatMessage?.(payload as ChatMessagePayload);
      }
    );

    // 2. Presence listeners
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel?.presenceState() as Record<string, PresenceRiderState[]> || {};
      this.handlers.onPresenceSync?.(state);

      // Immediately render coordinates for all stationary riders synced through presence
      Object.values(state).forEach((presences) => {
        const p = presences[0];
        if (p?.location) {
          this.handlers.onLocationUpdate?.(p.location);
        }
      });
    });

    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (newPresences && newPresences[0]) {
        const riderState = newPresences[0] as unknown as PresenceRiderState;
        this.handlers.onPresenceJoin?.(key, riderState);
        if (riderState.location) {
          this.handlers.onLocationUpdate?.(riderState.location);
        }
      }
    });

    this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (leftPresences && leftPresences[0]) {
        this.handlers.onPresenceLeave?.(key, leftPresences[0] as unknown as PresenceRiderState);
      }
    });

    // 3. Subscribe & Track Presence
    this.channel.subscribe(async (status) => {
      this.handlers.onStatusChange?.(status);

      if (status === 'SUBSCRIBED' && this.channel) {
        await this.channel.track(currentUserState);
      }
    });
  }

  /**
   * Updates current user's tracked presence with fresh GPS coordinates
   */
  async updatePresence(newState: Partial<PresenceRiderState>): Promise<void> {
    if (!this.channel) return;
    try {
      // Fetch existing state or merge
      const currentState = (this.channel.presenceState() as Record<string, PresenceRiderState[]>)?.[newState.userId || '']?.[0];
      await this.channel.track({
        ...currentState,
        ...newState,
        onlineAt: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to update presence state:', err);
    }
  }

  /**
   * Broadcasts current user's GPS position to other riders
   */
  async broadcastLocation(locationPayload: LocationBroadcastPayload): Promise<void> {
    if (!this.channel) return;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'location',
        payload: locationPayload,
      });
    } catch (err) {
      console.warn('Failed to broadcast location:', err);
    }
  }

  /**
   * Broadcasts destination/route update notification
   */
  async broadcastRouteUpdated(payload: RouteUpdatedBroadcastPayload): Promise<void> {
    if (!this.channel) return;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'route-updated',
        payload,
      });
    } catch (err) {
      console.warn('Failed to broadcast route update:', err);
    }
  }

  /**
   * Broadcasts low-frequency ride event (start, end, etc.)
   */
  async broadcastRideEvent(payload: RideEventBroadcastPayload): Promise<void> {
    if (!this.channel) return;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'ride-event',
        payload,
      });
    } catch (err) {
      console.warn('Failed to broadcast ride event:', err);
    }
  }

  /**
   * Broadcasts real-time chat message to all riders in the room
   */
  async broadcastChatMessage(payload: ChatMessagePayload): Promise<void> {
    if (!this.channel) return;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'chat',
        payload,
      });
    } catch (err) {
      console.warn('Failed to broadcast chat message:', err);
    }
  }

  /**
   * Cleanly leaves the channel
   */
  async unsubscribe(): Promise<void> {
    if (this.channel) {
      try {
        await this.channel.untrack();
        await supabase.removeChannel(this.channel);
      } catch (err) {
        console.warn('Error during channel unsubscribe:', err);
      }
      this.channel = null;
    }
  }
}
