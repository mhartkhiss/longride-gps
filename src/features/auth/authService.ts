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
}
