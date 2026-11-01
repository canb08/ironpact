/* global Deno */
// Vitest discovers this required filename too. Real integration tests execute
// with Deno in the db job, never with an emulated or production backend.
declare global {
  interface ImportMeta { vitest?: { test: { skip(name: string, fn: () => void): void } } }
}

if (import.meta.vitest) {
  import.meta.vitest.test.skip('Deno integration suite runs against local Supabase in the db job', () => {});
} else {
  const sdkSpecifier = 'jsr:@supabase/supabase-js@2.118.0';
  const { createClient } = await import(sdkSpecifier) as typeof import('jsr:@supabase/supabase-js@2.118.0');
  const { formatExport, EXPORT_CONTENT_TYPE } = await import('../_shared/export-format.ts');
  const { createExportHandler } = await import('./handler.ts');
  const { createExportStore } = await import('./store.ts');
  const { sha256hex } = await import('../_shared/export-http.ts');
  type ExportInput = import('../_shared/export-format.ts').ExportInput;
  type ExportStore = import('./store.ts').ExportStore;

  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const equal = (actual: unknown, expected: unknown, message: string): void => {
    // Never print received values: a failing test must not leak credentials.
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
  };
  const requiredEnv = (name: string): string => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing integration environment: ${name}`);
    return value;
  };
  const api = requiredEnv('SUPABASE_URL');
  const endpoint = requiredEnv('EXPORT_TEST_URL');
  for (const value of [api, endpoint]) {
    const host = new URL(value).hostname;
    assert(host === '127.0.0.1' || host === 'localhost' || host === '[::1]', 'Integration tests require a local stack');
  }
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requiredEnv('SUPABASE_ANON_KEY');
  const admin = createClient(api, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const dbOk = <T extends { data: unknown; error: unknown }>(result: T): T['data'] => {
    if (result.error) throw new Error('Local fixture operation failed');
    return result.data;
  };

  Deno.test('A5 local export contract and cross-user isolation', async (t) => {
    const userIds: string[] = [];
    const password = crypto.randomUUID() + crypto.randomUUID();
    const makeUser = async (email: string) => {
      const created = dbOk(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
      assert(created.user !== null, 'Fixture user created');
      userIds.push(created.user.id);
      const client = createClient(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      dbOk(await client.auth.signInWithPassword({ email, password }));
      const token: unknown = dbOk(await client.rpc('create_export_token', { label: 'Local integration' }));
      assert(typeof token === 'string', 'Token creation returns plaintext once');
      return { id: created.user.id, client, token };
    };
    try {
      const a = await makeUser('alice@example.test');
      const b = await makeUser('bob@example.test');
      const sessionA = crypto.randomUUID();
      const sessionB = crypto.randomUUID();
      const exercise = crypto.randomUUID();
      const at = '2026-10-24T08:00:00Z';
      const date = '2026-10-24';
      dbOk(await admin.from('profiles').insert([
        { id: a.id, display_name: 'A', initial: 'A', color_hue: 125 },
        { id: b.id, display_name: 'B', initial: 'B', color_hue: 220 },
      ]));
      dbOk(await admin.from('exercises').insert({ id: exercise, owner_id: a.id, name: 'Archive lift', export_label: 'Archive lift', kind: 'lift', deleted_at: at }));
      const sessions = [
        { id: sessionA, user_id: a.id, kind: 'gym', mode: 'full', started_at: at, local_date: date, tz: 'Europe/Amsterdam', client_updated_at: at, note: 'A private note' },
        { id: sessionB, user_id: b.id, kind: 'gym', mode: 'full', started_at: at, local_date: date, tz: 'Europe/Amsterdam', client_updated_at: at, note: 'B private note' },
      ];
      dbOk(await admin.from('sessions').insert(sessions));
      const sets = [
        { id: crypto.randomUUID(), user_id: a.id, session_id: sessionA, exercise_id: exercise, set_index: 1, reps: 5, weight_kg: 80, logged_at: at, local_date: date, client_updated_at: at },
        { id: crypto.randomUUID(), user_id: b.id, session_id: sessionB, exercise_id: '00000000-0000-4000-8000-000000000001', set_index: 1, reps: 5, weight_kg: 120, logged_at: at, local_date: date, client_updated_at: at },
      ];
      dbOk(await admin.from('sets').insert(sets));
      const input: ExportInput = { user_id: a.id, tz: 'Europe/Amsterdam', sessions: [sessions[0]!],
        exercises: [{ id: exercise, export_label: 'Archive lift', kind: 'lift' }], sets: [sets[0]!] };
      const call = async (token: string | null = a.token, suffix = '', init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        // Compare the function's representation validator without gateway gzip
        // weakening a GET tag while leaving the bodyless HEAD tag strong.
        headers.set('Accept-Encoding', 'identity');
        if (token !== null && !headers.has('X-Export-Token')) headers.set('Authorization', `Bearer ${token}`);
        return await fetch(endpoint + suffix, { ...init, headers });
      };
      const tokenRow = async (token: string) => {
        const data = dbOk(await admin.from('export_tokens').select('id,window_count,window_start,last_used_at')
          .eq('token_hash', await sha256hex(token)).single());
        assert(data !== null, 'Fixture token exists');
        return data;
      };

      await t.step('200 owner-only lines byte-match the frozen formatter; deleted exercise still has label', async () => {
        const response = await call();
        equal(response.status, 200, 'Own export succeeds');
        equal(await response.text(), formatExport(input, 'lines'), 'Only A rows byte-match formatExport');
        equal(response.headers.get('Cache-Control'), 'private, no-cache', 'Private revalidation header');
        equal(response.headers.get('X-Content-Type-Options'), 'nosniff', 'No sniffing');
        assert((await tokenRow(a.token)).last_used_at !== null, 'Last use is recorded');
      });
      await t.step('B token returns only B rows', async () => {
        const response = await call(b.token);
        equal(response.status, 200, 'B export succeeds');
        const body = await response.text();
        assert(body.includes('B private note') && !body.includes('A private note'), 'B isolation');
      });
      await t.step('401 missing, malformed and unknown tokens are empty and delayed', async () => {
        for (const token of [null, 'bad-token', 'spx_' + 'A'.repeat(43)]) {
          const start = performance.now();
          const response = await call(token);
          equal(response.status, 401, 'Invalid token rejected');
          equal(await response.text(), '', '401 body empty');
          assert(performance.now() - start >= 195, 'Unauthorized response waits 200ms (5ms timer tolerance)');
        }
      });
      await t.step('400 query token, invalid date and invalid format; 405 wrong method', async () => {
        for (const suffix of ['?token=forbidden', '?since=2026-02-30', '?format=xml']) {
          const response = await call(a.token, suffix);
          equal(response.status, 400, 'Bad input rejected');
          const body = await response.text();
          if (suffix.includes('since')) equal(body, 'bad since', 'Bad since text');
        }
        const response = await call(a.token, '', { method: 'POST' });
        equal(response.status, 405, 'Method rejected');
        await response.body?.cancel();
      });
      await t.step('JSON/CSV bytes and content types; profile format; since is inclusive', async () => {
        for (const format of ['json', 'csv'] as const) {
          const response = await call(a.token, `?format=${format}`);
          equal(response.headers.get('Content-Type'), EXPORT_CONTENT_TYPE[format], 'Format content type');
          equal(await response.text(), formatExport(input, format), 'Format bytes');
        }
        dbOk(await admin.from('profiles').update({ export_format: 'json' }).eq('id', a.id));
        const response = await call();
        equal(await response.text(), formatExport(input, 'json'), 'Profile default format');
        dbOk(await admin.from('profiles').update({ export_format: 'lines' }).eq('id', a.id));
        for (const since of [date, '2026-10-25']) {
          const filtered = await call(a.token, `?since=${since}`);
          equal(await filtered.text(), formatExport(input, 'lines', since), 'Inclusive date filtering');
        }
      });
      await t.step('304 stable ETag and HEAD returns headers without a body; fallback header works', async () => {
        const first = await call();
        const etag = first.headers.get('ETag');
        assert(etag !== null, 'ETag present');
        await first.body?.cancel();
        const response = await call(a.token, '', { headers: { 'If-None-Match': etag } });
        equal(response.status, 304, 'Unchanged export');
        equal(await response.text(), '', '304 empty');
        const head = await call(a.token, '', { method: 'HEAD' });
        equal(head.status, 200, 'HEAD succeeds');
        assert(head.headers.get('ETag') === etag,
          `HEAD ETag differs: GET ${etag}, HEAD ${head.headers.get('ETag')}`);
        equal(head.headers.get('Content-Type'), EXPORT_CONTENT_TYPE.lines, 'HEAD content type');
        equal(await head.text(), '', 'HEAD empty');
        const fallback = await call(null, '', { headers: { 'X-Export-Token': a.token } });
        equal(await fallback.text(), formatExport(input, 'lines'), 'Fallback header');
      });
      await t.step('pagination exports more than the API default 1000 rows', async () => {
        const rows = Array.from({ length: 1005 }, (_, n) => ({ id: crypto.randomUUID(), user_id: a.id,
          session_id: sessionA, local_date: date, client_updated_at: at, logged_at: new Date(Date.parse(at) + n * 1000).toISOString(), description: `Walk ${n}` }));
        for (let offset = 0; offset < rows.length; offset += 250) dbOk(await admin.from('min_entries').insert(rows.slice(offset, offset + 250)));
        const response = await call();
        equal(await response.text(), formatExport({ ...input, min_entries: rows }, 'lines'), 'Full export not truncated');
        dbOk(await admin.from('min_entries').delete().eq('user_id', a.id));
      });
      await t.step('60th succeeds, 61st returns 429 with Retry-After; expired window resets', async () => {
        const row = await tokenRow(a.token);
        dbOk(await admin.from('export_tokens').update({ window_count: 59, window_start: new Date().toISOString() }).eq('id', row.id));
        const sixtieth = await call();
        equal(sixtieth.status, 200, '60th succeeds');
        await sixtieth.body?.cancel();
        const limited = await call();
        equal(limited.status, 429, '61st limited');
        const retry = Number(limited.headers.get('Retry-After'));
        assert(retry > 0 && retry <= 3600, 'Retry-After remaining seconds');
        await limited.body?.cancel();
        dbOk(await admin.from('export_tokens').update({ window_start: new Date(Date.now() - 3_600_001).toISOString() }).eq('id', row.id));
        const reset = await call();
        equal(reset.status, 200, 'Expired window resets');
        await reset.body?.cancel();
        equal((await tokenRow(a.token)).window_count, 1, 'New window starts at one');
      });
      await t.step('parallel requests preserve every increment and enforce the cap', async () => {
        const row = await tokenRow(a.token);
        dbOk(await admin.from('export_tokens').update({ window_count: 55, window_start: new Date().toISOString() }).eq('id', row.id));
        const statuses = await Promise.all(Array.from({ length: 12 }, async () => {
          const response = await call();
          await response.body?.cancel();
          return response.status;
        }));
        equal(statuses.filter(status => status === 200).length, 5, 'Only remaining five requests succeed');
        equal(statuses.filter(status => status === 429).length, 7, 'Excess parallel requests limited');
        equal((await tokenRow(a.token)).window_count, 67, 'No lost increments');
      });
      await t.step('CAS window expires strictly after one hour, not at the exact boundary', async () => {
        const row = await tokenRow(b.token);
        const start = Date.parse('2026-10-24T00:00:00Z');
        dbOk(await admin.from('export_tokens').update({ window_count: 7, window_start: new Date(start).toISOString() }).eq('id', row.id));
        const store = createExportStore(api, serviceKey);
        const token = await store.findToken(await sha256hex(b.token));
        assert(token !== null, 'Boundary token loaded');
        const boundary = await store.consumeToken(token, () => start + 3_600_000);
        equal(boundary?.window_count, 8, 'Exact hour increments existing window');
        const expired = await store.consumeToken(boundary!, () => start + 3_600_001);
        equal(expired?.window_count, 1, 'One millisecond later resets window');
      });
      await t.step('F-1/F-6 full golden fixture survives the database and function in all formats', async () => {
        const fixture = JSON.parse(await Deno.readTextFile('tests/fixtures/export/basic.json')) as ExportInput;
        const expectedLines = await Deno.readTextFile('tests/fixtures/export/basic.txt');
        const expectedJson = await Deno.readTextFile('tests/fixtures/export/basic.json.expected.json');
        const expectedCsv = await Deno.readTextFile('tests/fixtures/export/basic.csv.expected.csv');
        dbOk(await admin.from('sets').delete().eq('user_id', b.id));
        dbOk(await admin.from('sessions').delete().eq('user_id', b.id));
        const users = new Map([['u1', b.id], ['u2', a.id]]);
        const ids = new Map<string, string>();
        const mapped = (id: string): string => {
          if (!ids.has(id)) ids.set(id, crypto.randomUUID());
          return ids.get(id)!;
        };
        const globalExercises = dbOk(await admin.from('exercises').select('id,export_label').is('owner_id', null)
          .in('export_label', fixture.exercises.map(row => row.export_label)));
        assert(globalExercises !== null, 'Golden exercises loaded');
        for (const exerciseRow of fixture.exercises) {
          const found = globalExercises.find(row => row.export_label === exerciseRow.export_label);
          assert(found !== undefined, 'Golden exercise exists in seed');
          ids.set(exerciseRow.id, found.id);
        }
        const remappedSessions = fixture.sessions.map(row => ({ ...row, id: mapped(row.id),
          user_id: users.get(row.user_id)!, tz: fixture.tz, client_updated_at: at }));
        dbOk(await admin.from('sessions').insert(remappedSessions, { defaultToNull: false }));
        const parent = (id: string) => {
          const session = remappedSessions.find(row => row.id === mapped(id));
          assert(session !== undefined, 'Golden parent exists');
          return { session_id: session.id, local_date: session.local_date, user_id: session.user_id };
        };
        dbOk(await admin.from('sets').insert((fixture.sets ?? []).map(row => ({ ...row,
          id: mapped(row.id), exercise_id: mapped(row.exercise_id), ...parent(row.session_id), client_updated_at: at })), { defaultToNull: false }));
        dbOk(await admin.from('cardio_entries').insert((fixture.cardio_entries ?? []).map(row => ({ ...row,
          id: mapped(row.id), ...parent(row.session_id), client_updated_at: at })), { defaultToNull: false }));
        dbOk(await admin.from('martial_entries').insert((fixture.martial_entries ?? []).map(row => ({ ...row,
          id: mapped(row.id), ...parent(row.session_id), client_updated_at: at })), { defaultToNull: false }));
        dbOk(await admin.from('min_entries').insert((fixture.min_entries ?? []).map(row => ({ ...row,
          id: mapped(row.id), ...parent(row.session_id!), client_updated_at: at })), { defaultToNull: false }));
        dbOk(await admin.from('bodyweight_entries').insert((fixture.bodyweight_entries ?? []).map(row => ({ ...row,
          id: mapped(row.id), user_id: b.id, client_updated_at: at })), { defaultToNull: false }));
        for (const [format, expected] of [['lines', expectedLines], ['json', expectedJson], ['csv', expectedCsv]] as const) {
          const response = await call(b.token, `?format=${format}`);
          equal(response.status, 200, 'Golden format succeeds');
          equal(await response.text(), expected, 'Golden format byte equality');
        }
        const firstJson = await call(b.token, '?format=json');
        const jsonTag = firstJson.headers.get('ETag');
        await firstJson.body?.cancel();
        const nextJson = await call(b.token, '?format=json');
        equal(nextJson.headers.get('ETag'), jsonTag, 'JSON ETag stable across last-use updates');
        await nextJson.body?.cancel();
      });
      await t.step('revoked token is delayed 401; replacement succeeds immediately', async () => {
        const row = await tokenRow(a.token);
        dbOk(await a.client.rpc('revoke_export_token', { id: row.id }));
        const start = performance.now();
        const response = await call();
        equal(response.status, 401, 'Revoked token rejected');
        equal(await response.text(), '', 'Revoked body empty');
        assert(performance.now() - start >= 195, 'Revoked token delayed');
        const replacement: unknown = dbOk(await a.client.rpc('create_export_token', { label: 'Replacement' }));
        assert(typeof replacement === 'string', 'Replacement generated');
        const fresh = await call(replacement);
        equal(fresh.status, 200, 'Replacement succeeds');
        await fresh.body?.cancel();
      });
      await t.step('500 unexpected error is sanitized; HEAD suppresses error body', async () => {
        const failing = createExportHandler({ store: () => { throw new Error('Synthetic internal details'); }, now: () => 0, wait: async () => {} });
        for (const method of ['GET', 'HEAD']) {
          const response = await failing(new Request(endpoint, { method, headers: { 'X-Export-Token': 'spx_' + 'A'.repeat(43) } }));
          equal(response.status, 500, 'Unexpected error status');
          equal(await response.text(), method === 'HEAD' ? '' : 'export failed', 'Sanitized error body');
        }
      });
      await t.step('health is 200 ok', async () => {
        const response = await fetch(new URL('health', endpoint));
        equal(response.status, 200, 'Health status');
        equal(await response.text(), 'ok', 'Health body');
      });
    } finally {
      for (const id of userIds.reverse()) {
        // A2 restricts exercise deletion while sets reference it. Delete those
        // fixture sets first; all remaining rows cascade with their user.
        dbOk(await admin.from('sets').delete().eq('user_id', id));
        dbOk(await admin.auth.admin.deleteUser(id));
      }
    }
  });

  Deno.test('A5 handler counts HEAD/304 and handles mid-request revocation with injected time', async () => {
    const token = { id: crypto.randomUUID(), user_id: crypto.randomUUID(), window_start: new Date(0).toISOString(), window_count: 1 };
    const waits: number[] = [];
    const input: ExportInput = { user_id: token.user_id, tz: 'Europe/Amsterdam', exercises: [], sessions: [] };
    let consumed = 0;
    let live = true;
    const store: ExportStore = {
      findToken: async () => token,
      consumeToken: async () => { consumed += 1; return token; },
      loadExport: async () => ({ input, format: 'lines' }),
      markUsed: async () => live,
    };
    const handler = createExportHandler({ store: () => store, now: () => 1000, wait: async ms => { waits.push(ms); } });
    const headers = { 'X-Export-Token': 'spx_' + 'A'.repeat(43) };
    const first = await handler(new Request(endpoint, { method: 'HEAD', headers }));
    assert(!first.headers.has('Access-Control-Allow-Origin'), 'Function emits no CORS header');
    const get = await handler(new Request(endpoint, { headers }));
    equal(first.headers.get('ETag'), get.headers.get('ETag'), 'Handler HEAD and GET ETag match');
    await get.body?.cancel();
    const cached = await handler(new Request(endpoint, { headers: { ...headers, 'If-None-Match': first.headers.get('ETag')! } }));
    equal(cached.status, 304, 'Injected conditional response');
    equal(consumed, 3, 'GET, HEAD and 304 all consume quota');
    live = false;
    const revoked = await handler(new Request(endpoint, { headers }));
    equal(revoked.status, 401, 'Concurrent revocation suppresses export');
    equal(waits, [200], 'Unauthorized path requests exactly 200ms delay');
    // Exercise the real store factory's configuration without a network call.
    assert(typeof createExportStore(api, serviceKey).findToken === 'function', 'Store factory available');
  });
}
