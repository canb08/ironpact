import type { SupabaseClient } from '@supabase/supabase-js';

let client: Promise<SupabaseClient> | undefined;

// A hung request must not hold the single-flight sync forever; a timeout surfaces as a transient error and backs off.
export const REQUEST_TIMEOUT_MS = 15_000;

export function withTimeout(fetchImpl: typeof fetch, ms = REQUEST_TIMEOUT_MS): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, timeout])
      : init?.signal ?? timeout;
    return fetchImpl(input, { ...init, signal });
  };
}

/** One persisted browser client. Keep the SDK off the initial application path. */
export function getSupabaseClient(): Promise<SupabaseClient> {
  client ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Missing Supabase configuration');
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: withTimeout((input, init) => fetch(input, init)) },
    });
  })();
  return client;
}
