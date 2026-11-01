import { AuthApiError, createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseRemote } from '../../src/data/adapter.supabase.ts';

function setup(fetcher: typeof fetch = async () => new Response('[]', { status: 200 })) {
  const client = createClient('http://127.0.0.1:54321', 'local-test-placeholder', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  });
  return { client, remote: createSupabaseRemote(client) };
}
afterEach(() => vi.restoreAllMocks());

describe('Supabase adapter failure classification', () => {
  it.each([400, 401, 403, 409, 422, 429, 500, 503])('classifies HTTP %i without dropping retryable writes', async (status) => {
    const { remote } = setup(async () => new Response(JSON.stringify({ message: 'write rejected', code: 'test' }), { status }));
    expect(await remote.upsert('sets', [{ id: crypto.randomUUID() }])).toEqual({
      ok: false, error: { kind: status < 500 && status !== 429 ? 'client' : 'transient', status, message: 'write rejected' },
    });
  });

  it('keeps thrown transport failures transient and read failures as network', async () => {
    const { remote } = setup(async () => { throw new TypeError('offline'); });
    expect(await remote.upsert('sets', [{ id: crypto.randomUUID() }])).toMatchObject({ ok: false, error: { kind: 'transient' } });
    expect(await remote.pullPage('sets', null, 1000)).toEqual({ ok: false, error: 'network' });
    expect(await remote.fetchByIds('sets', [crypto.randomUUID()])).toEqual({ ok: false, error: 'network' });
    await expect(remote.serverNow()).rejects.toThrow('Server clock unavailable');
  });

  it('rejects an oversized statement before sending it and treats an empty batch as a no-op', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const { remote } = setup(fetcher);
    expect(await remote.upsert('sets', Array.from({ length: 101 }, () => ({ id: crypto.randomUUID() })))).toMatchObject({ ok: false, error: { kind: 'client', status: 400 } });
    expect(await remote.upsert('sets', [])).toEqual({ ok: true, value: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps sendCode 429 and invalid email errors to the frozen error names', async () => {
    const { remote, client } = setup();
    const send = vi.spyOn(client.auth, 'signInWithOtp');
    send.mockResolvedValueOnce({ data: { user: null, session: null }, error: new AuthApiError('limited', 429, 'over_email_send_rate_limit') });
    expect(await remote.sendCode('alice@example.test')).toEqual({ ok: false, error: 'rate_limited' });
    send.mockResolvedValueOnce({ data: { user: null, session: null }, error: new AuthApiError('invalid', 422, 'email_address_invalid') });
    expect(await remote.sendCode('invalid')).toEqual({ ok: false, error: 'invalid_email' });
    send.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
    expect(await remote.sendCode('alice@example.test')).toEqual({ ok: true, value: undefined });
    expect(send).toHaveBeenLastCalledWith({ email: 'alice@example.test' });
  });

  it('requires six digits, verifies email OTP and distinguishes expired, bad and retryable codes', async () => {
    const { remote, client } = setup();
    const verify = vi.spyOn(client.auth, 'verifyOtp');
    expect(await remote.verifyCode('alice@example.test', '12345')).toEqual({ ok: false, error: 'bad_code' });
    expect(verify).not.toHaveBeenCalled();
    for (const [status, code, expected] of [[403, 'otp_expired', 'expired'], [400, 'validation_failed', 'bad_code'], [429, 'over_request_rate_limit', 'network'], [503, 'unexpected_failure', 'network']] as const) {
      verify.mockResolvedValueOnce({ data: { user: null, session: null }, error: new AuthApiError('rejected', status, code) });
      expect(await remote.verifyCode('alice@example.test', '123456')).toEqual({ ok: false, error: expected });
    }
    expect(verify).toHaveBeenLastCalledWith({ email: 'alice@example.test', token: '123456', type: 'email' });
  });
});
