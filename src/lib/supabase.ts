import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Fallback dummy client for preview/mock when env is incomplete
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'placeholder-key';

export const supabase = createClient(
  env.supabaseUrl || fallbackUrl,
  env.supabaseAnonKey || fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
