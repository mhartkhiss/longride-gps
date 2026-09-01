export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  mapboxToken: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '',
};

export const hasValidSupabaseConfig = Boolean(
  env.supabaseUrl && env.supabaseAnonKey && !env.supabaseUrl.includes('your-project')
);

export const hasValidMapboxConfig = Boolean(
  env.mapboxToken && !env.mapboxToken.includes('placeholder')
);
