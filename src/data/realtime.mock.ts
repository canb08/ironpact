import { weekCredits } from '../core/credits.ts';
import { crewWeekBounds, weekStartOf } from '../core/weeks.ts';
import { spotWindowOpen } from '../core/streak.ts';
import type { CardioEntry, MartialEntry, MinEntry, PulledTable, Result, Session, SetRow } from '../core/types.ts';
import type { RemoteRow } from './adapter.ts';
import type { CrewPresence, CrewRealtime, CrewRealtimeCallbacks, SpotError } from './duo.contract.ts';
import { localDateIn } from './clock.ts';

/** Isolated in-memory rooms; any number of members/connections, including tabs. */
export function createMockRealtimeBus() {
  const rooms = new Map<string, Map<object, { callbacks: CrewRealtimeCallbacks; presence: CrewPresence | null }>>();
  return {
    connect(crewId: string, callbacks: CrewRealtimeCallbacks): CrewRealtime {
      let room = rooms.get(crewId);
      if (!room) { room = new Map(); rooms.set(crewId, room); }
      const peers = room;
      const key = {};
      const peer = { callbacks, presence: null as CrewPresence | null };
      peers.set(key, peer);
      const emit = () => {
        const rows = [...peers.values()].flatMap((entry) => entry.presence ? [entry.presence] : []);
        for (const entry of peers.values()) entry.callbacks.onPresence(structuredClone(rows));
      };
      emit();
      return {
        setPresence(row) { if (!peers.has(key)) return; peer.presence = structuredClone(row); emit(); },
        reconnect() { if (peers.has(key)) { emit(); callbacks.onChange(); } },
        close() { peers.delete(key); emit(); if (!peers.size) rooms.delete(crewId); },
      };
    },
    change(crewId: string) { for (const peer of rooms.get(crewId)?.values() ?? []) peer.callbacks.onChange(); },
  };
}
const buses = new WeakMap<object, ReturnType<typeof createMockRealtimeBus>>();

/** Observe the existing mock server without changing any of its write methods.
 * The short poll is mock-only; delivery is an in-memory bus notification, and
 * the Repo still pulls through Remote/RLS and the real mirror/outbox path.
 */
export function createMockRealtime(source: object, crewId: string, callbacks: CrewRealtimeCallbacks,
  snapshot: () => string): CrewRealtime {
  let bus = buses.get(source);
  if (!bus) { bus = createMockRealtimeBus(); buses.set(source, bus); }
  const connection = bus.connect(crewId, callbacks);
  let previous = snapshot();
  const timer = setInterval(() => {
    const next = snapshot();
    if (next !== previous) { previous = next; bus.change(crewId); }
  }, 50);
  return { ...connection, close() { clearInterval(timer); connection.close(); } };
}

/** Mirror P3A's RPC checks, including idempotency before the window check. */
export function mockUseSpot(userId: string | null, weekStart: string, now: string,
  rows: (table: PulledTable) => RemoteRow[], seed: (table: PulledTable, rows: RemoteRow[]) => void): Result<string, SpotError> {
  const fail = (error: SpotError): Result<never, SpotError> => ({ ok: false, error });
  if (!userId) return fail('unauthenticated');
  try { if (weekStartOf(weekStart) !== weekStart) return fail('invalid_week_start'); }
  catch { return fail('invalid_week_start'); }
  const membership = rows('crew_members').find((row) => row.user_id === userId && row.left_at === null);
  const crew = rows('crews').find((row) => row.id === membership?.crew_id);
  if (!crew || typeof crew.tz !== 'string') return fail('not_in_crew');
  const members = rows('crew_members').filter((row) => row.crew_id === crew.id);
  if (members.some((row) => row.left_at !== null)) return fail('crew_archived');
  const tokens = rows('streak_tokens');
  const existing = tokens.find((row) => row.user_id === userId && row.crew_id === crew.id
    && row.kind === 'spot' && row.week_start === weekStart && !row.deleted_at);
  if (existing?.id) return { ok: true, value: existing.id };
  if (crewWeekBounds(now, crew.tz).weekStart !== weekStart || !spotWindowOpen(now, crew.tz)) return fail('spot_window_closed');
  if (rows('crew_weeks').some((row) => row.crew_id === crew.id && row.week_start === weekStart)) return fail('week_closed');
  const date = localDateIn(crew.tz, now);
  if (tokens.some((row) => row.user_id === userId && row.kind === 'spot'
    && String(row.local_date).slice(0, 7) === date.slice(0, 7))) return fail('spot_monthly_limit');
  const credits = (id: string) => weekCredits({
    sessions: rows('sessions').filter((row) => row.user_id === id) as unknown as Session[],
    sets: rows('sets').filter((row) => row.user_id === id) as unknown as SetRow[],
    cardio: rows('cardio_entries').filter((row) => row.user_id === id) as unknown as CardioEntry[],
    martial: rows('martial_entries').filter((row) => row.user_id === id) as unknown as MartialEntry[],
    min: rows('min_entries').filter((row) => row.user_id === id) as unknown as MinEntry[],
  }, weekStart).credits;
  const target = rows('profiles').find((row) => row.id === userId)?.weekly_target;
  if (typeof target !== 'number' || credits(userId) < target + 1) return fail('spot_needs_extra_credit');
  const partner = members.filter((row) => row.user_id !== userId
    && localDateIn(crew.tz as string, String(row.joined_at)) < weekStart
    && credits(String(row.user_id)) === 0
    && !tokens.some((token) => token.crew_id === crew.id && token.week_start === weekStart
      && token.kind === 'spot' && token.covers_user_id === row.user_id && !token.deleted_at))
    .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)) || String(a.user_id).localeCompare(String(b.user_id)))[0];
  if (!partner) return fail('no_partner_needs_spot');
  const id = crypto.randomUUID();
  seed('streak_tokens', [{ id, user_id: userId, crew_id: crew.id, week_start: weekStart,
    kind: 'spot', covers_user_id: partner.user_id, local_date: date, client_updated_at: now,
    created_at: now, updated_at: now, deleted_at: null }]);
  return { ok: true, value: id };
}
