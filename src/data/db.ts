import Dexie, { type Table } from 'dexie';
import type { BodyweightEntry, CardioEntry, Crew, CrewMember, Exercise, MartialEntry, MinEntry, Profile, PulledTable, Session, SetRow, SyncedTable } from '../core/types.ts';
import type { RemoteRow } from './adapter.ts';

export interface OutboxEntry {
  seq?: number;
  table: SyncedTable;
  row_id: string;
  payload: RemoteRow;
  /**
   * Earlier payloads the server must accept before `payload`. A PR tombstone is
   * legal only as an update of an unchanged claim, so the live claim stays here
   * until that insert has been acknowledged.
   */
  prelude?: RemoteRow[];
  /** Generation of `payload`. Send `gen - prelude.length` before anything newer. */
  gen?: number;
  revision: string;
  status: 'pending' | 'dead';
  created_at: string;
  last_error: string | null;
}
export interface MetaEntry { key: string; value: unknown }

export class IronpactDB extends Dexie {
  declare profiles: Table<Profile, string>;
  declare crews: Table<Crew, string>;
  declare crew_members: Table<CrewMember, [string, string]>;
  declare exercises: Table<Exercise, string>;
  declare sessions: Table<Session, string>;
  declare sets: Table<SetRow, string>;
  declare cardio_entries: Table<CardioEntry, string>;
  declare martial_entries: Table<MartialEntry, string>;
  declare min_entries: Table<MinEntry, string>;
  declare bodyweight_entries: Table<BodyweightEntry, string>;
  declare outbox: Table<OutboxEntry, number>;
  declare meta: Table<MetaEntry, string>;

  constructor(name = 'ironpact') {
    super(name);
    this.version(1).stores({
      profiles: 'id', crews: 'id', crew_members: '[crew_id+user_id], user_id',
      exercises: 'id, owner_id, export_label, updated_at', exercise_muscles: '[exercise_id+muscle], exercise_id',
      exercise_prefs: 'id, [user_id+exercise_id]',
      sessions: 'id, [user_id+local_date], [user_id+started_at], kind, updated_at',
      sets: 'id, session_id, [user_id+exercise_id+logged_at], [user_id+local_date], updated_at',
      cardio_entries: 'id, session_id, [user_id+local_date], updated_at',
      martial_entries: 'id, session_id, [user_id+local_date], updated_at',
      min_entries: 'id, session_id, [user_id+local_date], updated_at',
      bodyweight_entries: 'id, [user_id+local_date], [user_id+measured_at], updated_at',
      goals: 'id, user_id', pr_events: 'id, user_id, source_id, exercise_id, updated_at',
      reactions: 'id, to_user, target_id, updated_at', nudges: 'id, to_user, sent_on',
      streak_tokens: 'id, crew_id, week_start', crew_weeks: '[crew_id+week_start]',
      challenges: 'id, crew_id, status', challenge_participants: '[challenge_id+user_id]',
      outbox: '++seq, [table+row_id], row_id, status, created_at', meta: 'key',
    });
  }

  mirror(table: PulledTable): Table<RemoteRow, string | string[]> { return this.table(table); }
  async clearAccount(): Promise<void> {
    await this.transaction('rw', this.tables, async () => {
      for (const table of this.tables) await table.clear();
    });
  }
}

const compositeColumns: Partial<Record<PulledTable, readonly string[]>> = {
  exercise_muscles: ['exercise_id', 'muscle'], crew_members: ['crew_id', 'user_id'],
  crew_weeks: ['crew_id', 'week_start'], challenge_participants: ['challenge_id', 'user_id'],
};
export const SNAPSHOT_TABLES: ReadonlySet<PulledTable> = new Set(['exercise_muscles', 'crews', 'crew_members', 'crew_weeks', 'nudges', 'challenge_participants']);
export const SNAPSHOT_TIMESTAMP = '1970-01-01T00:00:00.000Z';
export function mirrorRow(table: PulledTable, row: RemoteRow): RemoteRow {
  const result = { ...row };
  if (SNAPSHOT_TABLES.has(table)) delete result.updated_at;
  return result;
}
/** Remote cursor IDs must use this stable encoding for the four composite keys. */
export function rowKey(table: PulledTable, row: RemoteRow): string {
  const columns = compositeColumns[table];
  if (columns) return JSON.stringify(columns.map((column) => String(row[column])));
  if (typeof row.id !== 'string') throw new Error(`Missing primary key: ${table}`);
  return row.id;
}
export function primaryKey(table: PulledTable, row: RemoteRow): string | string[] {
  const columns = compositeColumns[table];
  return columns ? columns.map((column) => String(row[column])) : rowKey(table, row);
}
export function asRemote(row: object): RemoteRow { return { ...row }; }
