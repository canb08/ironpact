import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRemote } from '../../src/data/adapter.supabase.ts';
import type { Remote } from '../../src/data/adapter.ts';
import { defaultProfile } from '../../src/data/defaults.ts';

/** Credentials come only from `supabase status`; refuse non-local fixture writes. */
export async function localStack() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error('Missing local Supabase integration configuration');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Integration tests require a local stack');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, service, options);
  const clients: SupabaseClient[] = [];
  const users: string[] = [];
  const password = crypto.randomUUID() + crypto.randomUUID();
  const requireSuccess = <T extends { error: unknown }>(response: T): T => {
    if (response.error) throw new Error('Local fixture operation failed');
    return response;
  };
  async function makeUser(email: string) {
    const { data } = requireSuccess(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    if (!data.user) throw new Error('Local fixture user missing');
    users.push(data.user.id);
    const client = createClient(url!, anon!, options);
    clients.push(client);
    const signIn = async () => {
      requireSuccess(await client.auth.signInWithPassword({ email, password }));
      const remote = createSupabaseRemote(client);
      await remote.serverNow(); // Await real session restoration before giving the contract its Remote.
      return remote;
    };
    return { id: data.user.id, client, signIn };
  }
  async function reset() {
    // Respect restrictive exercise FKs. These users belong only to this isolated local suite.
    for (const table of ['reactions', 'pr_events', 'sets', 'cardio_entries', 'martial_entries', 'min_entries',
      'exercise_prefs', 'goals', 'bodyweight_entries', 'sessions', 'export_tokens', 'invite_attempts']) {
      requireSuccess(await admin.from(table).delete().in('user_id', users));
    }
    requireSuccess(await admin.from('crews').delete().in('created_by', users));
    requireSuccess(await admin.from('exercises').delete().in('owner_id', users));
    for (const id of users) requireSuccess(await admin.from('profiles').upsert(defaultProfile(id, 'Europe/Amsterdam')));
  }
  try {
    const alice = await makeUser('alice@example.test');
    const bob = await makeUser('bob@example.test');
    let remote: Remote = await alice.signIn();
    return {
      admin, alice, bob, url,
      get remote() { return remote; },
      async reset() { await reset(); remote = await alice.signIn(); },
      async close() {
        await reset();
        for (const client of clients) await client.auth.signOut();
        for (const id of users) requireSuccess(await admin.auth.admin.deleteUser(id));
      },
    };
  } catch (error) {
    for (const id of users) await admin.auth.admin.deleteUser(id);
    throw error;
  }
}
