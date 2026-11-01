/* global Deno */
import { createExportHandler } from './handler.ts';
import { createExportStore } from './store.ts';

Deno.serve(createExportHandler({
  store: () => {
    const url = Deno.env.get('SUPABASE_URL');
    const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const injectedKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
    const key: unknown = legacyKey || (injectedKeys ? JSON.parse(injectedKeys).default : undefined);
    if (!url || typeof key !== 'string' || key.length === 0) throw new Error('Missing backend configuration');
    return createExportStore(url, key);
  },
  now: () => Date.now(),
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
}));
