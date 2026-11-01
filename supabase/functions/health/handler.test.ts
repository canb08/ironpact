import { describe, expect, it } from 'vitest';
import { createHealthHandler } from './handler.ts';

describe('database health (L4)', () => {
  it('does not report 200 ok until a database read completes', async () => {
    let release!: () => void;
    const database = new Promise<void>((resolve) => { release = resolve; });
    let completed = false;
    const pending = createHealthHandler(() => database)().then((response) => { completed = true; return response; });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('returns sanitized 503 when the database read fails', async () => {
    const response = await createHealthHandler(async () => { throw new Error('internal connection details'); })();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('unavailable');
  });
});
