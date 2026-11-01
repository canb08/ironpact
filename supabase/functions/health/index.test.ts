import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('health entrypoint database read', () => {
  async function request(env: Record<string, string>, fetcher: typeof fetch) {
    let handler!: () => Promise<Response>;
    vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (callback: () => Promise<Response>) => { handler = callback; } });
    vi.stubGlobal('fetch', fetcher);
    await import('./index.ts');
    return handler();
  }

  it.each(['legacy', 'injected'])('reads exercises with the %s server credential before returning ok', async (kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
    const env: Record<string, string> = { SUPABASE_URL: 'http://example.test' };
    if (kind === 'legacy') env.SUPABASE_SERVICE_ROLE_KEY = 'local-placeholder';
    else env.SUPABASE_SECRET_KEYS = JSON.stringify({ default: 'local-placeholder' });
    const response = await request(env, fetcher);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://example.test/rest/v1/exercises?select=id&limit=1');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ apikey: 'local-placeholder', Authorization: 'Bearer local-placeholder' });
  });

  it.each(['missing', 'malformed', 'database', 'transport', 'invalid-json'])('fails closed for %s failures', async (failure) => {
    const env: Record<string, string> = { SUPABASE_URL: 'http://example.test' };
    if (failure !== 'missing') env.SUPABASE_SECRET_KEYS = failure === 'malformed' ? '{' : JSON.stringify({ default: 'local-placeholder' });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (failure === 'transport') throw new TypeError('private backend details');
      return new Response(failure === 'invalid-json' ? '{}' : 'unavailable', { status: failure === 'database' ? 503 : 200 });
    });
    const response = await request(env, fetcher);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('unavailable');
    if (failure === 'missing' || failure === 'malformed') expect(fetcher).not.toHaveBeenCalled();
  });
});
