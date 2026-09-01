import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { AuthService } from '@/features/auth/authService';

interface SessionState {
  user: User | null;
  displayName: string;
  vehicleType: string;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  initSession: () => Promise<User | null>;
  setDisplayName: (name: string) => void;
  setVehicleType: (vehicle: string) => void;
}

const STORAGE_KEY_NAME = 'longride_display_name';
const STORAGE_KEY_VEHICLE = 'longride_vehicle_type';

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  displayName: localStorage.getItem(STORAGE_KEY_NAME) || '',
  vehicleType: localStorage.getItem(STORAGE_KEY_VEHICLE) || 'motorcycle',
  isInitialized: false,
  isLoading: false,
  error: null,

  initSession: async () => {
    if (get().isInitialized && get().user) {
      return get().user;
    }

    set({ isLoading: true, error: null });
    try {
      const user = await AuthService.ensureAnonymousSession();
      set({
        user,
        isInitialized: true,
        isLoading: false,
      });
      return user;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      set({ error: message, isLoading: false, isInitialized: true });
      return null;
    }
  },

  setDisplayName: (name: string) => {
    localStorage.setItem(STORAGE_KEY_NAME, name);
    set({ displayName: name });
  },

  setVehicleType: (vehicle: string) => {
    localStorage.setItem(STORAGE_KEY_VEHICLE, vehicle);
    set({ vehicleType: vehicle });
  },
}));
