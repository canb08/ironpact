/* global Deno */
import { createHealthHandler } from './handler.ts';

Deno.serve(createHealthHandler(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const injectedKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const key: unknown = legacyKey || (injectedKeys ? JSON.parse(injectedKeys).default : undefined);
  if (!url || typeof key !== 'string' || key.length === 0) throw new Error('Missing backend configuration');
  const response = await fetch(new URL('/rest/v1/exercises?select=id&limit=1', url), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok || !Array.isArray(await response.json())) throw new Error('Database unavailable');
}));
