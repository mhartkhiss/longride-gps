import { create } from 'zustand';
import { Destination, Ride, RideParticipant } from '@/types/database';
import { RouteResult } from '@/features/routing/mapboxDirections';

interface RideState {
  currentRide: Ride | null;
  participants: RideParticipant[];
  isHost: boolean;
  destination: Destination | null;
  route: RouteResult | null;
  realtimeStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  onlineUserIds: string[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setRide: (ride: Ride | null, currentUserId?: string) => void;
  setParticipants: (participants: RideParticipant[]) => void;
  addOrUpdateParticipant: (participant: RideParticipant) => void;
  removeParticipant: (userId: string) => void;
  setDestination: (destination: Destination | null) => void;
  setRoute: (route: RouteResult | null) => void;
  setRealtimeStatus: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR') => void;
  setOnlineUserIds: (userIds: string[]) => void;
  addOnlineUserId: (userId: string) => void;
  removeOnlineUserId: (userId: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  resetRide: () => void;
}

export const useRideStore = create<RideState>((set) => ({
  currentRide: null,
  participants: [],
  isHost: false,
  destination: null,
  route: null,
  realtimeStatus: 'DISCONNECTED',
  onlineUserIds: [],
  isLoading: false,
  error: null,

  setRide: (ride, currentUserId) => {
    if (!ride) {
      set({ currentRide: null, isHost: false, destination: null });
      return;
    }

    set((state) => {
      const isHost = currentUserId !== undefined ? ride.host_user_id === currentUserId : state.isHost;
      const destination =
        ride.destination_lat && ride.destination_lng
          ? {
              lat: ride.destination_lat,
              lng: ride.destination_lng,
              name: ride.destination_name || 'Shared Destination',
            }
          : state.destination;

      return { currentRide: ride, isHost, destination };
    });
  },

  setParticipants: (participants) => set({ participants }),

  addOrUpdateParticipant: (participant) =>
    set((state) => {
      const index = state.participants.findIndex((p) => p.user_id === participant.user_id);
      if (index >= 0) {
        const next = [...state.participants];
        next[index] = participant;
        return { participants: next };
      }
      return { participants: [...state.participants, participant] };
    }),

  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.user_id !== userId),
      onlineUserIds: state.onlineUserIds.filter((id) => id !== userId),
    })),

  setDestination: (destination) => set({ destination }),

  setRoute: (route) => set({ route }),

  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),

  setOnlineUserIds: (onlineUserIds) => set({ onlineUserIds }),

  addOnlineUserId: (userId) =>
    set((state) => ({
      onlineUserIds: state.onlineUserIds.includes(userId)
        ? state.onlineUserIds
        : [...state.onlineUserIds, userId],
    })),

  removeOnlineUserId: (userId) =>
    set((state) => ({
      onlineUserIds: state.onlineUserIds.filter((id) => id !== userId),
    })),

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  resetRide: () =>
    set({
      currentRide: null,
      participants: [],
      isHost: false,
      destination: null,
      route: null,
      realtimeStatus: 'DISCONNECTED',
      onlineUserIds: [],
      isLoading: false,
      error: null,
    }),
}));
