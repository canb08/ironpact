import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRealtime, parsePresence, REALTIME_TABLES } from '../../../src/data/realtime.ts';
import type { CrewPresence } from '../../../src/data/duo.contract.ts';
import { deferred } from './harness.ts';

const payload: CrewPresence = { user_id: 'member-a', session_id: 'session-a', kind: 'gym',
  exercise_label: 'Bench', set_no: 2, planned_sets: 5, started_at: '2026-11-01T12:00:00Z', last_active_at: '2026-11-01T12:01:00Z' };
class Channel {
  state = 'closed';
  joined = false;
  handlers: { type: string; filter: Record<string, unknown>; cb: () => void }[] = [];
  callback?: (state: string) => void;
  presence: Record<string, unknown[]> = {};
  track = vi.fn<(row: CrewPresence) => Promise<string>>(async () => 'ok');
  untrack = vi.fn(async () => 'ok');
  constructor(readonly name: string, readonly options: unknown) {}
  on(type: string, filter: Record<string, unknown>, cb: () => void) { this.handlers.push({ type, filter, cb }); return this; }
  subscribe(cb: (state: string) => void) {
    if (this.joined) throw new Error('Phoenix join is single-use');
    this.joined = true; this.state = 'joined'; this.callback = cb; cb('SUBSCRIBED'); return this;
  }
  presenceState() { return this.presence; }
  fire(type: string) { for (const handler of this.handlers) if (handler.type === type) handler.cb(); }
}
function fixture() {
  const channels: Channel[] = [];
  const removeChannel = vi.fn(async (channel: Channel) => { channel.state = 'closed'; return 'ok'; });
  const client = { channel(name: string, options: unknown) { const channel = new Channel(name, options); channels.push(channel); return channel; }, removeChannel };
  const onChange = vi.fn(); const onPresence = vi.fn();
  const connection = createSupabaseRealtime(client as unknown as SupabaseClient, 'crew-a', 'member-a', { onChange, onPresence });
  return { channels, removeChannel, onChange, onPresence, connection };
}
describe('Supabase realtime transport', () => {
  it('uses private crew presence and one unfiltered, RLS-governed channel per published table', () => {
    const { channels, connection } = fixture();
    try {
      expect(channels[0]?.name).toBe('crew:crew-a');
      expect(channels[0]?.options).toEqual({ config: { private: true, presence: { key: 'member-a' } } });
      expect(channels.slice(1).map((channel) => channel.handlers[0]?.filter)).toEqual(
        REALTIME_TABLES.map((table) => ({ event: '*', schema: 'public', table })));
      expect(channels.slice(1).every((channel) => JSON.stringify(channel.options).includes('"wait":true'))).toBe(true);
    } finally { connection.close(); }
  });
  it('validates remote presence and treats row events as pull notifications', () => {
    const { channels, connection, onChange, onPresence } = fixture();
    try {
      channels[0]!.presence = { a: [payload, { ...payload, last_active_at: 'bad' }] };
      channels[0]!.fire('presence');
      expect(onPresence).toHaveBeenLastCalledWith([payload]);
      onChange.mockClear(); channels[2]!.fire('postgres_changes');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(parsePresence({ ...payload, planned_sets: -1 })).toBeNull();
    } finally { connection.close(); }
  });
  it('rebuilds disconnected channels once, ignores stale callbacks and never reuses Phoenix join', async () => {
    const { channels, connection, onChange, removeChannel } = fixture();
    try {
      connection.reconnect(); expect(removeChannel).not.toHaveBeenCalled();
      const old = channels.slice(); old[2]!.state = 'errored';
      connection.reconnect(); connection.reconnect();
      await vi.waitFor(() => expect(channels).toHaveLength(26));
      expect(removeChannel).toHaveBeenCalledTimes(13);
      onChange.mockClear(); old[2]!.fire('postgres_changes'); old[0]!.callback?.('SUBSCRIBED');
      expect(onChange).not.toHaveBeenCalled();
      channels[15]!.fire('postgres_changes'); expect(onChange).toHaveBeenCalledTimes(1);
    } finally { connection.close(); }
  });
  it('finish untracks after an in-flight track and close removes every channel', async () => {
    const { channels, connection, removeChannel, onChange } = fixture();
    const blocked = deferred<string>();
    channels[0]!.track.mockImplementationOnce(() => blocked.promise);
    connection.setPresence(payload);
    await vi.waitFor(() => expect(channels[0]!.track).toHaveBeenCalled());
    channels[0]!.untrack.mockClear();
    connection.setPresence(null);
    expect(channels[0]!.untrack).toHaveBeenCalled();
    blocked.resolve('ok');
    await vi.waitFor(() => expect(channels[0]!.untrack).toHaveBeenCalled());
    connection.close(); connection.close();
    expect(removeChannel).toHaveBeenCalledTimes(13);
    onChange.mockClear(); channels[2]!.fire('postgres_changes');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('coalesces bursts within the server budget and reserves an immediate finish event', async () => {
    vi.useFakeTimers();
    const { channels, connection } = fixture();
    try {
      expect(channels[0]!.untrack).not.toHaveBeenCalled();
      for (let i = 1; i <= 10; i++) connection.setPresence({ ...payload, set_no: i });
      expect(channels[0]!.track).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(30_100);
      expect(channels[0]!.track).toHaveBeenCalledTimes(5);
      expect(channels[0]!.track).toHaveBeenLastCalledWith({ ...payload, set_no: 10 });
      for (let i = 11; i <= 20; i++) connection.setPresence({ ...payload, set_no: i });
      expect(channels[0]!.track).toHaveBeenCalledTimes(8);
      connection.setPresence(null);
      expect(channels[0]!.untrack).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_100);
      expect(channels[0]!.track).toHaveBeenCalledTimes(8);
    } finally { connection.close(); vi.useRealTimers(); }
  });
  it('still untracks on finish when a track acknowledgement was lost', async () => {
    const { channels, connection } = fixture();
    try {
      channels[0]!.track.mockResolvedValueOnce('timed out');
      connection.setPresence(payload);
      await Promise.resolve();
      connection.setPresence(null);
      expect(channels[0]!.untrack).toHaveBeenCalledTimes(1);
    } finally { connection.close(); }
  });
});
