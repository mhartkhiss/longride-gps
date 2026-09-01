import { create } from 'zustand';
import { GpsLocation } from '@/features/location/locationTypes';
import { LocationBroadcastPayload } from '@/types/realtime';

export type CameraMode = 'FOLLOW_ME' | 'FIT_GROUP' | 'FREE' | 'FOLLOW_RIDER';

interface MapState {
  userLocation: GpsLocation | null;
  riderLocations: Record<string, LocationBroadcastPayload>;
  isSharingLocation: boolean;
  cameraMode: CameraMode;
  selectedUserId: string | null;
  followingUserId: string | null;
  mapPitch: number; // 0 for top-down, 55 for 3D navigation view

  // Actions
  setUserLocation: (loc: GpsLocation | null) => void;
  updateRiderLocation: (payload: LocationBroadcastPayload) => void;
  removeRiderLocation: (userId: string) => void;
  syncActiveRiders: (activeUserIds: string[]) => void;
  setSharingLocation: (isSharing: boolean) => void;
  setCameraMode: (mode: CameraMode) => void;
  setSelectedUserId: (userId: string | null) => void;
  setFollowingUserId: (userId: string | null) => void;
  clearFollowing: () => void;
  setMapPitch: (pitch: number) => void;
  clearRiderLocations: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  userLocation: null,
  riderLocations: {},
  isSharingLocation: true,
  cameraMode: 'FOLLOW_ME',
  selectedUserId: null,
  followingUserId: null,
  mapPitch: 0,

  setUserLocation: (userLocation) => set({ userLocation }),

  updateRiderLocation: (payload) =>
    set((state) => ({
      riderLocations: {
        ...state.riderLocations,
        [payload.userId]: payload,
      },
    })),

  removeRiderLocation: (userId) =>
    set((state) => {
      const updated = { ...state.riderLocations };
      delete updated[userId];
      return { riderLocations: updated };
    }),

  syncActiveRiders: (activeUserIds) =>
    set((state) => {
      const activeSet = new Set(activeUserIds);
      const updated: Record<string, LocationBroadcastPayload> = {};
      Object.entries(state.riderLocations).forEach(([id, loc]) => {
        if (activeSet.has(id)) {
          updated[id] = loc;
        }
      });
      return { riderLocations: updated };
    }),

  setSharingLocation: (isSharingLocation) => set({ isSharingLocation }),

  setCameraMode: (cameraMode) => set({ cameraMode }),

  setSelectedUserId: (selectedUserId) => set({ selectedUserId }),

  setFollowingUserId: (followingUserId) =>
    set({
      followingUserId,
      cameraMode: followingUserId ? 'FOLLOW_RIDER' : 'FOLLOW_ME',
    }),

  clearFollowing: () =>
    set({
      followingUserId: null,
      cameraMode: 'FOLLOW_ME',
    }),

  setMapPitch: (mapPitch) => set({ mapPitch }),

  clearRiderLocations: () =>
    set({
      riderLocations: {},
      userLocation: null,
      followingUserId: null,
      selectedUserId: null,
    }),
}));
