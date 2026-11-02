import { describe, expect, it, vi } from 'vitest';
import { createDeleteAccountHandler } from './handler.ts';

describe('delete-account boundary', () => {
  const setup = () => {
    const authenticate = vi.fn(async (): Promise<string | null> => 'caller');
    const deleteUser = vi.fn(async () => {});
    return { authenticate, deleteUser, handle: createDeleteAccountHandler(() => ({ authenticate, deleteUser })) };
  };
  it('rejects missing or invalid auth without deletion', async () => {
    const { handle, authenticate, deleteUser } = setup();
    expect((await handle(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
    authenticate.mockResolvedValueOnce(null);
    expect((await handle(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer invalid' } }))).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('only deletes the verified caller, ignoring body IDs', async () => {
    const { handle, deleteUser } = setup();
    const response = await handle(new Request('https://example.test', {
      method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ user_id: 'another-user' }),
    }));
    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith('caller');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('supports browser preflight and refuses other methods', async () => {
    const { handle, deleteUser } = setup();
    expect((await handle(new Request('https://example.test', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handle(new Request('https://example.test'))).status).toBe(405);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('returns a retryable failure without exposing backend errors', async () => {
    const { handle, deleteUser } = setup();
    deleteUser.mockRejectedValueOnce(new Error('private backend details'));
    const response = await handle(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer session' } }));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('Account deletion unavailable');
  });
});
