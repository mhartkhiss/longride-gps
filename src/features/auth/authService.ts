import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

export class AuthService {
  /**
   * Ensures an active anonymous session exists. If already signed in, returns active user.
   */
  static async ensureAnonymousSession(): Promise<User | null> {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.warn('Error fetching session:', sessionError);
      }

      if (session?.user) {
        return session.user;
      }

      // Perform native anonymous sign-in
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Anonymous sign-in error:', error.message);
        throw new Error(
          error.message.toLowerCase().includes('disabled')
            ? 'Anonymous Sign-ins are disabled in your Supabase project. Please enable "Allow Anonymous Sign-ins" in your Supabase Auth settings.'
            : error.message
        );
      }

      return data.user;
    } catch (err) {
      console.error('AuthService error:', err);
      throw err;
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  /**
   * Triggers OAuth flow with Google or Facebook
   */
  static async signInWithOAuth(provider: 'google' | 'facebook'): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) {
      console.error(`OAuth sign-in error (${provider}):`, error.message);
      throw error;
    }
  }

  /**
   * Signs the user out
   */
  static async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign-out error:', error.message);
      throw error;
    }
  }

  /**
   * Extracts display name and avatar URL from OAuth provider metadata
   */
  static extractUserProfile(user: User | null): { displayName: string; avatarUrl: string | null } {
    if (!user) return { displayName: '', avatarUrl: null };
    const meta = user.user_metadata || {};

    let rawName = '';

    // Check if first_name exists (Facebook often duplicates first_name as last_name when last_name is omitted)
    if (meta.first_name) {
      if (!meta.last_name || meta.first_name.trim().toLowerCase() === meta.last_name.trim().toLowerCase()) {
        rawName = meta.first_name.trim();
      } else {
        rawName = `${meta.first_name.trim()} ${meta.last_name.trim()}`;
      }
    }

    if (!rawName) {
      rawName =
        meta.full_name ||
        meta.name ||
        meta.user_name ||
        meta.preferred_username ||
        (user.email ? user.email.split('@')[0] : 'Rider');
    }

    // Clean duplicate first name if Facebook duplicated single name (e.g., "Alex Alex" -> "Alex")
    let displayName = rawName.trim();
    const parts = displayName.split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
      displayName = parts[0];
    }

    // Support string URLs and Facebook Graph API nested picture object ({ data: { url: "..." } })
    const avatarUrl =
      meta.avatar_url ||
      (typeof meta.picture === 'string' ? meta.picture : null) ||
      (meta.picture && typeof meta.picture === 'object' && meta.picture.data?.url ? meta.picture.data.url : null) ||
      meta.avatar ||
      null;

    return { displayName, avatarUrl };
  }
}
