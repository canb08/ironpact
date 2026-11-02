import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRemote, MOCK_USER_IDS } from '../../src/data/adapter.mock.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRemote } from '../../src/data/adapter.supabase.ts';
import { IronpactDB } from '../../src/data/db.ts';
import { createDataRepo } from '../../src/data/repo.ts';
import { ManualEnvironment, deferred } from '../unit/data/harness.ts';

describe('P5D account deletion through Repo', () => {
  let remote: ReturnType<typeof createMockRemote>;
  let db: IronpactDB;
  let repo: ReturnType<typeof createDataRepo>;
  let environment: ManualEnvironment;
  beforeEach(async () => {
    remote = createMockRemote();
    db = new IronpactDB(`ironpact-delete-${crypto.randomUUID()}`);
    environment = new ManualEnvironment();
    repo = createDataRepo(remote, { db, environment, autoStart: false });
    await repo.ready;
    await repo.w.logBodyweight(80); // deliberately unsynced
  });
  afterEach(async () => { repo.close(); await db.delete(); vi.restoreAllMocks(); });
  it('refuses offline deletion and preserves pending writes on server failure', async () => {
    const remove = vi.spyOn(remote, 'deleteAccount').mockResolvedValue({ ok: false, error: 'network' });
    expect(await repo.auth.deleteAccount()).toEqual({ ok: false, error: 'network' });
    expect(remove).not.toHaveBeenCalled();
    environment.setOnline(true);
    expect(await repo.auth.deleteAccount()).toEqual({ ok: false, error: 'network' });
    expect(await db.outbox.count()).toBe(1);
    expect(await db.bodyweight_entries.count()).toBe(1);
    expect(repo.auth.userId()).toBe(MOCK_USER_IDS.alice);
  });
  it('erases the mirror and outbox only after success; a new sign-in gets a new ID', async () => {
    environment.setOnline(true);
    expect((await repo.auth.deleteAccount()).ok).toBe(true);
    expect(repo.auth.userId()).toBeNull();
    expect(await Promise.all(db.tables.map((table) => table.count()))).toEqual(db.tables.map(() => 0));
    expect(remote.inspect('profiles').some((row) => row.id === MOCK_USER_IDS.alice)).toBe(false);
    expect(remote.inspect('profiles').some((row) => row.id === MOCK_USER_IDS.bob)).toBe(true);
    expect((await repo.auth.verifyCode('alice@example.test', '123456'))).not.toEqual({ ok: true, value: MOCK_USER_IDS.alice });
  });
  it('does not erase a new account when deletion returns after an account switch', async () => {
    environment.setOnline(true);
    const started = deferred<void>(); const release = deferred<void>();
    const remove = remote.deleteAccount.bind(remote);
    vi.spyOn(remote, 'deleteAccount').mockImplementation(async () => {
      const result = await remove(); started.resolve(); await release.promise; return result;
    });
    const deleting = repo.auth.deleteAccount();
    await started.promise;
    await repo.auth.verifyCode('bob@example.test', '123456');
    await repo.w.logBodyweight(90);
    release.resolve();
    expect((await deleting).ok).toBe(true);
    expect(repo.auth.userId()).toBe(MOCK_USER_IDS.bob);
    expect((await db.bodyweight_entries.toArray()).map((row) => row.weight_kg)).toEqual([90]);
  });
  it('ordinary sign-out still keeps pending local rows (L8)', async () => {
    await repo.auth.signOut();
    expect(await db.bodyweight_entries.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });
});

describe('P5D Supabase Remote deletion', () => {
  function setup() {
    const invoke = vi.fn(async () => ({ data: { deleted: true }, error: null as unknown }));
    const signOut = vi.fn(async () => ({ error: null }));
    const client = { functions: { invoke }, auth: {
      onAuthStateChange: vi.fn(), getSession: async () => ({ data: { session: { user: { id: MOCK_USER_IDS.alice } } } }),
      signOut,
    } } as unknown as SupabaseClient;
    return { remote: createSupabaseRemote(client), invoke, signOut };
  }
  it('invokes only delete-account and clears local auth after confirmation', async () => {
    const { remote, invoke, signOut } = setup();
    expect((await remote.deleteAccount()).ok).toBe(true);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('delete-account', { body: {} });
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(remote.currentUserId()).toBeNull();
  });
  it('retains authentication on function failure', async () => {
    const { remote, invoke, signOut } = setup();
    invoke.mockResolvedValueOnce({ data: { deleted: false }, error: new Error('unavailable') });
    expect(await remote.deleteAccount()).toEqual({ ok: false, error: 'network' });
    expect(signOut).not.toHaveBeenCalled();
    expect(remote.currentUserId()).toBe(MOCK_USER_IDS.alice);
  });
});
