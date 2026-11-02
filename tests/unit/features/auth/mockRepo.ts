import type { Crew, CrewMember, Profile, Uuid } from '../../../../src/core/types.ts';
import type {
  Repo,
  RepoAuth,
  RepoCrew,
  RepoExport,
  RepoQueries,
  RepoSync,
  RepoWrites,
  SyncStatus,
} from '../../../../src/data/adapter.ts';

const status: SyncStatus = { state: 'idle', pendingCount: 0, deadCount: 0, lastSyncedAt: null };

export function testProfile(patch: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    display_name: 'Alex',
    initial: 'A',
    color_hue: 125,
    tz: 'Europe/Amsterdam',
    weekly_target: 3,
    show_bodyweight: false,
    share_dots: false,
    sound_on: false,
    haptics_on: false,
    reduce_motion: false,
    battery_saver: false,
    big_jumps: false,
    theme: 'dark',
    quiet_start: '22:00',
    quiet_end: '08:00',
    notify: { partner_start: false, partner_pr: false, nudge: false, recap: false, spot: false },
    min_default_label: '20m walk',
    gym_treat_url: null,
    bar_kg: 20,
    plates_kg: [20],
    export_format: 'lines',
    ...patch,
  };
}

export function testCrew(patch: Partial<Crew> = {}): Crew {
  return {
    id: 'crew-1',
    name: 'Crew',
    tz: 'Europe/Amsterdam',
    max_members: 8,
    created_by: 'user-1',
    ...patch,
  };
}

export function testMember(userId: Uuid = 'user-1'): CrewMember {
  return {
    crew_id: 'crew-1',
    user_id: userId,
    role: 'owner',
    joined_at: '2026-11-01T00:00:00.000Z',
    left_at: null,
  };
}

export function mockRepo(partial: {
  userId?: Uuid | null;
  auth?: Partial<RepoAuth>;
  crew?: Partial<RepoCrew>;
  q?: Partial<RepoQueries>;
  w?: Partial<RepoWrites>;
} = {}): Repo {
  let userId = partial.userId === undefined ? null : partial.userId;
  const listeners = new Set<(id: Uuid | null) => void>();
  const notify = (id: Uuid | null) => {
    userId = id;
    for (const listener of listeners) listener(id);
  };
  const auth: RepoAuth = {
    userId: () => userId,
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    sendCode: async () => ({ ok: true, value: undefined }),
    deleteAccount: async () => ({ ok: true, value: undefined }),
    verifyCode: async () => {
      notify('user-1');
      return { ok: true, value: 'user-1' };
    },
    signOut: async () => notify(null),
    ...partial.auth,
  };
  if (partial.auth?.verifyCode) {
    const verify = partial.auth.verifyCode;
    auth.verifyCode = async (email, code) => {
      const result = await verify(email, code);
      if (result.ok) notify(result.value);
      return result;
    };
  }
  const crew: RepoCrew = {
    create: async () => ({ ok: true, value: testCrew() }),
    createInvite: async () => ({ ok: true, value: 'ABCDEFGHJK' }),
    redeem: async () => ({ ok: true, value: testCrew() }),
    leave: async () => ({ ok: true, value: undefined }),
    ...partial.crew,
  };
  const q: RepoQueries = {
    me: async () => undefined,
    profiles: async () => [],
    myCrew: async () => undefined,
    exercises: async () => [],
    recentExercises: async () => [],
    openSession: async () => undefined,
    session: async () => undefined,
    setsOfSession: async () => [],
    lastSessionSummary: async () => undefined,
    entriesBetween: async () => ({ sessions: [], sets: [], cardio: [], martial: [], min: [], bodyweight: [] }),
    crewFeed: async () => [],
    isPending: async () => false,
    deadLetters: async () => [],
    exerciseHistory: async () => [],
    recentSessionsWithSets: async () => [],
    prEvents: async () => [],
    exercisePref: async () => undefined,
    day: async () => ({ sessions: [], sets: [], cardio: [], martial: [], min: [], bodyweight: [] }),
    ...partial.q,
  };
  const w: RepoWrites = {
    upsertMyProfile: async (patch) => ({ ok: true, value: testProfile(patch) }),
    createExercise: async () => ({ ok: false, error: 'storage_full' }),
    startSession: async () => ({ ok: false, error: 'storage_full' }),
    finishSession: async () => ({ ok: false, error: 'storage_full' }),
    discardSession: async () => ({ ok: false, error: 'storage_full' }),
    logSet: async () => ({ ok: false, error: 'storage_full' }),
    updateSet: async () => ({ ok: false, error: 'storage_full' }),
    logRun: async () => ({ ok: false, error: 'storage_full' }),
    logMartial: async () => ({ ok: false, error: 'storage_full' }),
    logMin: async () => ({ ok: false, error: 'storage_full' }),
    logBodyweight: async () => ({ ok: false, error: 'storage_full' }),
    softDelete: async () => ({ ok: false, error: 'storage_full' }),
    restore: async () => ({ ok: false, error: 'storage_full' }),
    recordPrEvents: async () => ({ ok: true, value: [] }),
    recomputePrs: async () => ({ ok: true, value: { changed: false } }),
    setExercisePref: async () => ({ ok: false, error: 'storage_full' }),
    updateSession: async () => ({ ok: false, error: 'storage_full' }),
    updateEntry: async () => ({ ok: false, error: 'storage_full' }),
    ...partial.w,
  };
  const exportTokens: RepoExport = {
    createToken: async () => ({ ok: false, error: 'network' }),
    revokeToken: async () => ({ ok: false, error: 'network' }),
    listTokens: async () => ({ ok: true, value: [] }),
    setFormat: async () => ({ ok: true, value: testProfile() }),
  };
  const sync: RepoSync = {
    status: () => status,
    onStatus: () => () => {},
    flushNow: async () => {},
    pullNow: async () => {},
    retryDead: async () => {},
    discardDead: async () => {},
  };
  const duo: Repo['duo'] = {
    weeks: async () => [],
    spots: async () => [],
    bar: async () => ({ value: 0, history: [] }),
    useSpot: async () => ({ ok: false, error: 'network' }),
    presence: { onChange: () => () => {} },
    onCrewChange: () => () => {},
  };
  return { backend: 'mock', auth, q, w, crew, exportTokens, sync, duo };
}
