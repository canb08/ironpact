import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProofStorage, ProofStorageResult } from './adapter.ts';
function failure(error: { message: string; statusCode?: string | number }): ProofStorageResult {
  const status = Number(error.statusCode) || null;
  return { ok: false, error: status && status >= 400 && status < 500 && status !== 429
    ? { kind: 'client', status, message: error.message } : { kind: 'transient', status, message: error.message } };
}
export function supabaseProofStorage(ready: Promise<SupabaseClient>): ProofStorage {
  return {
    async upload(path, blob) {
      try {
        const { error } = await (await ready).storage.from('proof').upload(path, blob, { contentType: blob.type, upsert: true, cacheControl: '0' });
        return error ? failure(error) : { ok: true, value: undefined };
      } catch { return failure({ message: 'network' }); }
    },
    async remove(path) {
      try {
        const { error } = await (await ready).storage.from('proof').remove([path]);
        return error ? failure(error) : { ok: true, value: undefined };
      } catch { return failure({ message: 'network' }); }
    },
    async signedUrl(path, expiresIn) {
      try {
        const { data, error } = await (await ready).storage.from('proof').createSignedUrl(path, Math.min(300, expiresIn));
        return error || !data ? { ok: false, error: 'network' } : { ok: true, value: data.signedUrl };
      } catch { return { ok: false, error: 'network' }; }
    },
    clear() { /* Signed URLs are cached only by the account-scoped RepoProof. */ },
  };
}
