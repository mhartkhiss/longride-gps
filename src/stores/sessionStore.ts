import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { AuthService } from '@/features/auth/authService';

import { supabase } from '@/lib/supabase';

interface SessionState {
  user: User | null;
  displayName: string;
  avatarUrl: string | null;
  vehicleType: string;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initSession: () => Promise<User | null>;
  signInWithOAuth: (provider: 'google' | 'facebook') => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => void;
  setVehicleType: (vehicle: string) => void;
}

const STORAGE_KEY_NAME = 'longride_display_name';
const STORAGE_KEY_VEHICLE = 'longride_vehicle_type';
const STORAGE_KEY_AVATAR = 'longride_avatar_url';

let authListenerSubscribed = false;

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  displayName: localStorage.getItem(STORAGE_KEY_NAME) || '',
  avatarUrl: localStorage.getItem(STORAGE_KEY_AVATAR) || null,
  vehicleType: localStorage.getItem(STORAGE_KEY_VEHICLE) || 'motorcycle',
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,

  initSession: async () => {
    // Set up auth state change listener once
    if (!authListenerSubscribed && typeof window !== 'undefined') {
      authListenerSubscribed = true;
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const isAnon = session.user.is_anonymous || session.user.app_metadata?.provider === 'anonymous';
          const profile = AuthService.extractUserProfile(session.user);

          if (!isAnon) {
            localStorage.setItem(STORAGE_KEY_NAME, profile.displayName);
            if (profile.avatarUrl) {
              localStorage.setItem(STORAGE_KEY_AVATAR, profile.avatarUrl);
            }
            set({
              user: session.user,
              isAuthenticated: true,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
              isInitialized: true,
              isLoading: false,
            });
          } else {
            set({
              user: session.user,
              isAuthenticated: false,
              isInitialized: true,
              isLoading: false,
            });
          }
        } else {
          set({
            user: null,
            isAuthenticated: false,
            avatarUrl: null,
          });
        }
      });
    }

    if (get().isInitialized && get().user) {
      return get().user;
    }

    set({ isLoading: true, error: null });
    try {
      // 1. Check existing authenticated session first
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const isAnon = session.user.is_anonymous || session.user.app_metadata?.provider === 'anonymous';
        const profile = AuthService.extractUserProfile(session.user);

        if (!isAnon) {
          localStorage.setItem(STORAGE_KEY_NAME, profile.displayName);
          if (profile.avatarUrl) localStorage.setItem(STORAGE_KEY_AVATAR, profile.avatarUrl);

          set({
            user: session.user,
            isAuthenticated: true,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            isInitialized: true,
            isLoading: false,
          });
          return session.user;
        }
      }

      // 2. Otherwise ensure anonymous session exists
      const user = await AuthService.ensureAnonymousSession();
      set({
        user,
        isAuthenticated: false,
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

  signInWithOAuth: async (provider: 'google' | 'facebook') => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.signInWithOAuth(provider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'OAuth sign-in failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await AuthService.signOut();
      localStorage.removeItem(STORAGE_KEY_AVATAR);
      set({
        user: null,
        isAuthenticated: false,
        avatarUrl: null,
        isLoading: false,
      });
      // Re-establish anonymous session
      await AuthService.ensureAnonymousSession();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-out failed';
      set({ error: message, isLoading: false });
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
