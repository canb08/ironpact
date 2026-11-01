import type { SupabaseClient } from '@supabase/supabase-js';

let client: Promise<SupabaseClient> | undefined;

/** One persisted browser client. Keep the SDK off the initial application path. */
export function getSupabaseClient(): Promise<SupabaseClient> {
  client ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Missing Supabase configuration');
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  })();
  return client;
}
