import { create } from 'zustand';
import { GpsLocation } from '@/features/location/locationTypes';
import { LocationBroadcastPayload } from '@/types/realtime';

/**
 * FOLLOW_ME    — navigation camera glued to your puck (heading-up / tilted when enabled)
 * FOLLOW_RIDER — camera tracks another rider
 * FIT_GROUP    — framed to show the whole pack
 * FREE         — the rider panned / zoomed the map by hand
 */
export type CameraMode = 'FOLLOW_ME' | 'FIT_GROUP' | 'FREE' | 'FOLLOW_RIDER';
export type MapType = 'standard' | 'satellite';
export type ThemeSetting = 'auto' | 'day' | 'night';

export interface MapViewSettings {
  /** Rotate the map so your direction of travel points up (GTA / Google Maps navigation style). */
  headingUp: boolean;
  /** Tilted 3D perspective with buildings while following. */
  tilt3D: boolean;
  mapType: MapType;
  theme: ThemeSetting;
  /** Breadcrumb trails of where each rider has been. */
  showTrails: boolean;
  /** Highlight footpaths, alleys and off-road tracks on top of the base map. */
  showPathways: boolean;
}

export interface UiInsets {
  /** Height covered by floating UI at the top of the screen (px). */
  top: number;
  /** Height covered by the bottom sheet (px). */
  bottom: number;
}

export interface PickState {
  /** Where the crosshair starts; defaults to the current map center. */
  start?: [number, number];
}

const SETTINGS_KEY = 'longride_map_settings';

const DEFAULT_SETTINGS: MapViewSettings = {
  headingUp: true,
  tilt3D: true,
  mapType: 'standard',
  theme: 'auto',
  showTrails: true,
  showPathways: true,
};

function loadSettings(): MapViewSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<MapViewSettings>) };
  } catch {
    // ignore corrupt settings
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: MapViewSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface MapState {
  userLocation: GpsLocation | null;
  riderLocations: Record<string, LocationBroadcastPayload>;
  isSharingLocation: boolean;
  cameraMode: CameraMode;
  selectedUserId: string | null;
  followingUserId: string | null;
  settings: MapViewSettings;
  /** Extra zoom the rider dialled in with +/- while the navigation camera is following. */
  zoomOffset: number;
  uiInsets: UiInsets;
  /** Non-null while the host is choosing a destination by moving the map under a crosshair. */
  pickState: PickState | null;

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
  updateSettings: (patch: Partial<MapViewSettings>) => void;
  setZoomOffset: (offset: number) => void;
  setUiInsets: (patch: Partial<UiInsets>) => void;
  setPickState: (state: PickState | null) => void;
  clearRiderLocations: () => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  userLocation: null,
  riderLocations: {},
  isSharingLocation: true,
  cameraMode: 'FOLLOW_ME',
  selectedUserId: null,
  followingUserId: null,
  settings: loadSettings(),
  zoomOffset: 0,
  uiInsets: { top: 72, bottom: 120 },
  pickState: null,

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

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },

  setZoomOffset: (zoomOffset) => set({ zoomOffset: Math.max(-4, Math.min(3, zoomOffset)) }),

  setUiInsets: (patch) => {
    const current = get().uiInsets;
    const next = { ...current, ...patch };
    if (next.top !== current.top || next.bottom !== current.bottom) set({ uiInsets: next });
  },

  setPickState: (pickState) => set({ pickState }),

  clearRiderLocations: () =>
    set({
      riderLocations: {},
      userLocation: null,
      followingUserId: null,
      selectedUserId: null,
      pickState: null,
      cameraMode: 'FOLLOW_ME',
      zoomOffset: 0,
    }),
}));
