import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../../../src/data/supabase.ts';

describe('withTimeout', () => {
  it('aborts a hung request after the timeout', async () => {
    const hung: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
    await expect(withTimeout(hung, 20)('https://example.test')).rejects.toBeDefined();
  });

  it('passes a fast response through and keeps a caller abort signal working', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fast: typeof fetch = async (_input, init) => { seen.push(init?.signal); return new Response('ok'); };
    const response = await withTimeout(fast, 1_000)('https://example.test');
    expect(await response.text()).toBe('ok');
    expect(seen[0]).toBeInstanceOf(AbortSignal);

    const caller = new AbortController();
    const slow: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const pending = withTimeout(slow, 10_000)('https://example.test', { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow('aborted');
    vi.restoreAllMocks();
  });
});
