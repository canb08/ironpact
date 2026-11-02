import { liveQuery } from 'dexie';
import type { Remote } from './adapter.ts';
import type { Clock } from './clock.ts';
import type { IronpactDB } from './db.ts';
import type { CrewPresence, CrewRealtime, CrewWeek, RepoDuo, Spot } from './duo.contract.ts';
import { parsePresence, PRESENCE_TTL_MS } from './realtime.ts';
import type { SyncEnvironment } from './sync.ts';

export function createDuo(db: IronpactDB, remote: Remote, clock: Clock, env: SyncEnvironment,
  pull: () => Promise<void>) {
  let generation = 0;
  let activityVersion = 0;
  let connection: CrewRealtime | undefined;
  let crewId: string | null = null;
  let members = new Set<string>();
  let received: CrewPresence[] = [];
  let own: CrewPresence | null = null;
  let published: CrewPresence[] = [];
  let timer: unknown;
  let stopWatching: (() => void) | undefined;
  const presenceListeners = new Set<(rows: CrewPresence[]) => void>();
  const changeListeners = new Set<() => void>();
  let pullRequested = false;
  let pulling = false;
  const subscriptions: (() => void)[] = [];

  const currentCrew = async () => db.crew_members.where('user_id').equals(remote.currentUserId() ?? '')
    .filter((row) => row.left_at === null).first();
  const weeks = async (from: string): Promise<CrewWeek[]> => {
    const actor = remote.currentUserId();
    const membership = await currentCrew();
    if (!membership) return [];
    const rows = await db.table<CrewWeek>('crew_weeks').filter((row) => row.crew_id === membership.crew_id && row.week_start >= from).sortBy('week_start');
    return actor === remote.currentUserId() ? rows : [];
  };
  function emitPresence() {
    env.clearTimeout(timer);
    const now = Date.parse(clock.now());
    if (own && now - Date.parse(own.last_active_at) >= PRESENCE_TTL_MS) {
      own = null; connection?.setPresence(null);
    }
    const latest = new Map<string, CrewPresence>();
    for (const value of received) {
      const row = parsePresence(value);
      if (!row || row.user_id === remote.currentUserId() || !members.has(row.user_id)
        || now - Date.parse(row.last_active_at) >= PRESENCE_TTL_MS) continue;
      const previous = latest.get(row.user_id);
      if (!previous || row.last_active_at > previous.last_active_at) latest.set(row.user_id, row);
    }
    const next = [...latest.values()].sort((a, b) => a.user_id.localeCompare(b.user_id));
    if (JSON.stringify(next) !== JSON.stringify(published)) {
      published = next;
      for (const cb of presenceListeners) cb(structuredClone(next));
    }
    const expiries = [...next, ...(own ? [own] : [])].map((row) => Date.parse(row.last_active_at) + PRESENCE_TTL_MS - now);
    if (expiries.length) timer = env.setTimeout(emitPresence, Math.max(1, Math.min(...expiries)));
  }
  function requestPull() {
    if (!stopWatching || !env.online()) return;
    pullRequested = true;
    if (pulling) return;
    pulling = true;
    void (async () => {
      try {
        while (pullRequested && stopWatching) {
          pullRequested = false;
          const version = generation;
          await pull();
          if (version === generation) for (const cb of changeListeners) cb();
        }
      } finally { pulling = false; }
    })().catch(() => {});
  }
  async function connect(id: string) {
    const version = ++generation;
    connection?.close(); connection = undefined;
    received = []; emitPresence();
    try {
      const next = await remote.subscribeCrew(id, {
        onPresence(rows) { if (version === generation) { received = rows; emitPresence(); } },
        onChange() { if (version === generation) requestPull(); },
      });
      if (version !== generation) { next.close(); return; }
      connection = next;
      emitPresence(); next.setPresence(own);
      requestPull();
    } catch { /* Offline/auth failure: foreground/online and the normal pull recover. */ }
  }
  function stop() {
    generation++; activityVersion++;
    stopWatching?.(); stopWatching = undefined;
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    connection?.close(); connection = undefined;
    crewId = null; members.clear(); received = []; own = null; pullRequested = false;
    emitPresence();
  }
  function start() {
    if (stopWatching) return;
    const watcher = liveQuery(async () => {
      const membership = await currentCrew();
      return membership ? { id: membership.crew_id,
        members: await db.crew_members.filter((row) => row.crew_id === membership.crew_id && row.left_at === null).toArray() } : null;
    }).subscribe({ next(value) {
      members = new Set(value?.members.map((row) => row.user_id) ?? []);
      const next = value?.id ?? null;
      if (next !== crewId) {
        crewId = next;
        if (next && env.online()) void connect(next);
        else { generation++; connection?.close(); connection = undefined; received = []; }
      }
      emitPresence();
    }, error() { /* A closed DB must not create an unhandled observable error. */ } });
    stopWatching = () => watcher.unsubscribe();
    const resume = () => {
      if (!env.online()) { generation++; connection?.close(); connection = undefined; received = []; emitPresence(); return; }
      if (!env.visible()) return;
      emitPresence();
      if (crewId) { if (connection) connection.reconnect(); else void connect(crewId); }
      requestPull();
    };
    subscriptions.push(env.onVisibility(resume), env.onOnline(resume));
  }
  function activity(sessionId: string, exerciseId?: string) {
    if (!stopWatching) return;
    const version = ++activityVersion;
    const actor = remote.currentUserId();
    const at = clock.now();
    void (async () => {
      const session = await db.sessions.get(sessionId);
      if (!session || session.user_id !== actor || session.deleted_at || session.ended_at !== null) return;
      const sets = exerciseId ? await db.sets.where('session_id').equals(sessionId)
        .filter((row) => row.exercise_id === exerciseId && !row.deleted_at).toArray() : [];
      let planned = sets.length;
      if (exerciseId) {
        const history = await db.sets.filter((row) => row.user_id === actor && row.exercise_id === exerciseId
          && row.session_id !== sessionId && !row.deleted_at).toArray();
        const sessions = (await db.sessions.bulkGet([...new Set(history.map((row) => row.session_id))]))
          .filter((row) => row && !row.deleted_at && row.started_at < session.started_at)
          .sort((a, b) => b!.started_at.localeCompare(a!.started_at));
        if (sessions[0]) planned = history.filter((row) => row.session_id === sessions[0]!.id).length;
      }
      const exercise = exerciseId ? await db.exercises.get(exerciseId) : undefined;
      if (version !== activityVersion || actor !== remote.currentUserId()) return;
      own = { user_id: session.user_id, session_id: session.id, kind: session.kind,
        exercise_label: exercise?.export_label ?? null, set_no: sets.length, planned_sets: planned,
        started_at: session.started_at, last_active_at: at };
      emitPresence(); connection?.setPresence(own);
    })().catch(() => {});
  }
  function finish(sessionId: string) {
    activityVersion++;
    if (!own || own.session_id === sessionId) { own = null; connection?.setPresence(null); emitPresence(); }
  }
  const api: RepoDuo = {
    weeks,
    async bar() { const history = await weeks('0000-01-01'); return { value: history.at(-1)?.plates_after ?? 0, history }; },
    async spots() {
      const actor = remote.currentUserId();
      const membership = await currentCrew();
      const rows = membership ? await db.table<Spot>('streak_tokens').where('crew_id').equals(membership.crew_id)
        .filter((row) => row.kind === 'spot' && !row.deleted_at).sortBy('week_start') : [];
      return actor === remote.currentUserId() ? rows : [];
    },
    async useSpot(weekStart) {
      const version = generation;
      if (!env.online() || !remote.currentUserId()) return { ok: false, error: 'network' };
      try {
        const result = await remote.useSpot(weekStart);
        if (version !== generation) return { ok: false, error: 'network' };
        if (result.ok) await pull();
        return version === generation ? result : { ok: false, error: 'network' };
      } catch { return { ok: false, error: 'network' }; }
    },
    presence: { onChange(cb) { presenceListeners.add(cb); cb(structuredClone(published)); return () => { presenceListeners.delete(cb); }; } },
    onCrewChange(cb) { changeListeners.add(cb); return () => { changeListeners.delete(cb); }; },
  };
  return { api, start, stop, activity, finish, close() { stop(); presenceListeners.clear(); changeListeners.clear(); } };
}
