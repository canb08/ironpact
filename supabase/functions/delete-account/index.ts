/* global Deno */
import { createDeleteAccountHandler } from './handler.ts';

Deno.serve(createDeleteAccountHandler(() => {
  const url = Deno.env.get('SUPABASE_URL');
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const injectedKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const key: unknown = legacyKey || (injectedKeys ? JSON.parse(injectedKeys).default : undefined);
  if (!url || typeof key !== 'string' || !key) throw new Error('Missing backend configuration');
  return {
    async authenticate(token) {
      const response = await fetch(new URL('/auth/v1/user', url), {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error('Auth unavailable'); }
      const user: unknown = await response.json();
      if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string'
          || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error('Invalid Auth response');
      return user.id;
    },
    async deleteUser(id) {
      // Auth admin deleteUser's hard-delete endpoint. The database trigger performs
      // cleanup in this same transaction, including restrictive FKs and shared IDs.
      const response = await fetch(new URL(`/auth/v1/admin/users/${id}`, url), {
        method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      await response.body?.cancel();
      // Concurrent, already-authenticated calls may both attempt the same deletion.
      if (!response.ok && response.status !== 404) throw new Error('Deletion failed');
    },
  };
}));
