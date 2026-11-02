import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { CrewPresence, CrewRealtime, CrewRealtimeCallbacks } from './duo.contract.ts';

// Exactly the publication installed by P3A. RLS filters Postgres Changes, not a
// client-supplied crew/user filter (which would miss other members and updates).
export const REALTIME_TABLES = ['sessions', 'sets', 'cardio_entries', 'martial_entries',
  'min_entries', 'bodyweight_entries', 'pr_events', 'reactions', 'nudges', 'challenges',
  'crew_weeks', 'profiles'] as const;
export const PRESENCE_TTL_MS = 120_000;

export function parsePresence(value: unknown): CrewPresence | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== 'string' || typeof row.session_id !== 'string'
    || !['gym', 'run', 'martial', 'min'].includes(String(row.kind))
    || !(row.exercise_label === null || typeof row.exercise_label === 'string')
    || typeof row.set_no !== 'number' || !Number.isInteger(row.set_no) || row.set_no < 0
    || typeof row.planned_sets !== 'number' || !Number.isInteger(row.planned_sets) || row.planned_sets < 0
    || typeof row.started_at !== 'string' || !Number.isFinite(Date.parse(row.started_at))
    || typeof row.last_active_at !== 'string' || !Number.isFinite(Date.parse(row.last_active_at))) return null;
  return { user_id: row.user_id, session_id: row.session_id, kind: row.kind as CrewPresence['kind'],
    exercise_label: row.exercise_label, set_no: row.set_no, planned_sets: row.planned_sets,
    started_at: row.started_at, last_active_at: row.last_active_at };
}

export function createSupabaseRealtime(client: SupabaseClient, crewId: string, userId: string,
  callbacks: CrewRealtimeCallbacks): CrewRealtime {
  let closed = false;
  let desired: CrewPresence | null = null;
  let presence: RealtimeChannel;
  const channels: RealtimeChannel[] = [];
  let cycle = 0;
  let reconnecting = false;
  let lastSent: string | null = null;
  let sentAt: number[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Realtime v2.147.1 permits five client presence events per 30 seconds and
  // closes the channel on overflow. Keep one slot for immediate untrack; rapid
  // sets coalesce to the latest payload without delaying database delivery.
  // https://github.com/supabase/realtime/blob/v2.147.1/lib/realtime_web/channels/realtime_channel/presence_handler.ex
  const presenceWindow = 30_100;
  const publish = () => {
    clearTimeout(timer);
    if (closed || presence.state !== 'joined') return;
    const key = desired ? JSON.stringify(desired) : null;
    if (key === lastSent) return;
    const now = Date.now();
    sentAt = sentAt.filter((at) => now - at < presenceWindow);
    if (sentAt.length >= (desired ? 4 : 5)) {
      timer = setTimeout(publish, Math.max(1, sentAt[0]! + presenceWindow - now));
      return;
    }
    lastSent = key; sentAt.push(now);
    const version = cycle;
    // Websocket sends are ordered. Do not wait for a track acknowledgement to
    // send finish/untrack: a lost acknowledgement must not prolong presence.
    void (desired ? presence.track(desired) : presence.untrack()).then((result) => {
      if (version === cycle && result !== 'ok' && lastSent === key) lastSent = null;
    }).catch(() => { if (version === cycle && lastSent === key) lastSent = null; });
  };
  const subscribe = (channel: RealtimeChannel, version: number) => channel.subscribe((status) => {
    if (closed || cycle !== version || status !== 'SUBSCRIBED') return;
    if (channel === presence) { lastSent = null; sentAt = []; publish(); }
    callbacks.onChange(); // Close the subscribe/pull gap and recover after socket rejoin.
  });
  function join() {
    const version = ++cycle;
    presence = client.channel(`crew:${crewId}`, { config: { private: true, presence: { key: userId } } })
      .on('presence', { event: 'sync' }, () => {
        if (closed || cycle !== version) return;
        callbacks.onPresence(Object.values(presence.presenceState()).flat().flatMap((value) => {
          const row = parsePresence(value); return row ? [row] : [];
        }));
      });
    channels.push(presence);
    for (const table of REALTIME_TABLES) {
      channels.push(client.channel(`crew:${crewId}:rows:${table}`, {
        config: { postgres_changes_options: { wait: true } },
      }).on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (!closed && cycle === version) callbacks.onChange();
      }));
    }
    for (const channel of channels) subscribe(channel, version);
  }
  join();
  return {
    setPresence(row) { desired = row; publish(); },
    reconnect() {
      if (closed || reconnecting) return;
      if (channels.every((channel) => channel.state === 'joined')) { publish(); return; }
      // Phoenix join is single-use. Remove disconnected subscriptions and build
      // fresh channels; callbacks from the old generation are fenced out.
      reconnecting = true; cycle++; clearTimeout(timer);
      callbacks.onPresence([]);
      void Promise.all(channels.splice(0).map((channel) => client.removeChannel(channel)))
        .then(() => { if (!closed) join(); }).catch(() => {})
        .finally(() => { reconnecting = false; });
    },
    close() {
      if (closed) return;
      closed = true; desired = null; clearTimeout(timer);
      for (const channel of channels) void client.removeChannel(channel).catch(() => {});
    },
  };
}
