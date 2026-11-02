import type { SyncedTable } from '../core/types.ts';
import type { RemoteRow } from './adapter.ts';
import { type IronpactDB, type OutboxEntry, rowKey } from './db.ts';
import { newId } from './ids.ts';

export interface Mutation { table: SyncedTable; row: RemoteRow }
const SET_CLAIM_FIELDS = ['reps', 'weight_kg', 'is_warmup', 'deleted_at', 'exercise_id', 'session_id', 'local_date'] as const;
const CARDIO_CLAIM_FIELDS = ['distance_m', 'duration_s', 'deleted_at', 'local_date'] as const;

function sameClaim(before: RemoteRow, after: RemoteRow, fields: readonly string[]): boolean {
  return fields.every((field) => (before[field] ?? null) === (after[field] ?? null));
}

/** Live claim still queued, including one parked in front of its tombstone. */
function unsentLiveClaim(entry: OutboxEntry): RemoteRow | null {
  if (entry.table !== 'pr_events') return null;
  if (entry.prelude?.length) return entry.prelude[0] ?? null;
  return entry.payload.deleted_at ? null : entry.payload;
}

function claimNeedsSource(claim: RemoteRow, table: SyncedTable, source: RemoteRow): boolean {
  if (claim.source_id === source.id) return true;
  return table === 'sets' && claim.pr_type === 'volume' && claim.exercise_id != null && claim.exercise_id === source.exercise_id;
}

/**
 * P2F rejects a tombstone unless it is an UPDATE of an unchanged claim, and
 * rejects a claim whose value is not the source currently stored. An offline
 * edit must therefore sync the pre-image (and the claim computed from it)
 * before the edited source and the tombstone.
 */
async function chainPrelude(db: IronpactDB, table: SyncedTable, pending: OutboxEntry, row: RemoteRow): Promise<boolean> {
  if (table === 'pr_events') return !pending.payload.deleted_at && row.deleted_at != null;
  if (table !== 'sets' && table !== 'cardio_entries') return false;
  const fields = table === 'sets' ? SET_CLAIM_FIELDS : CARDIO_CLAIM_FIELDS;
  if (sameClaim(pending.payload, row, fields)) return false;
  const queued = await db.outbox.filter((entry) => entry.status === 'pending' && entry.table === 'pr_events').toArray();
  return queued.some((entry) => {
    const claim = unsentLiveClaim(entry);
    return claim != null && claimNeedsSource(claim, table, pending.payload);
  });
}

async function generationForNewPr(db: IronpactDB, row: RemoteRow): Promise<number> {
  const sources = await db.outbox.filter((entry) => entry.status === 'pending' && (entry.table === 'sets' || entry.table === 'cardio_entries')).toArray();
  return sources.reduce((gen, entry) => {
    const version = entry.payload;
    const preimage = entry.prelude?.[0] ?? version;
    const needs = claimNeedsSource(row, entry.table, version) || claimNeedsSource(row, entry.table, preimage);
    return needs ? Math.max(gen, entry.gen ?? 0) : gen;
  }, 0);
}

/** May be nested in a broader transaction (session + child, or set + PR tombstones). */
export async function enqueue(db: IronpactDB, mutations: readonly Mutation[], now: string): Promise<void> {
  await db.transaction('rw', [...new Set(mutations.map(({ table }) => db.mirror(table))), db.outbox], async () => {
    for (const { table, row } of mutations) {
      const row_id = rowKey(table, row);
      const existing = await db.outbox.where('[table+row_id]').equals([table, row_id]).toArray();
      const pending = existing.find((entry) => entry.status === 'pending');
      // A new user edit supersedes a dead payload too; it must not be replayable later.
      for (const entry of existing) if (entry.seq !== pending?.seq && entry.seq !== undefined) await db.outbox.delete(entry.seq);
      await db.mirror(table).put(row);
      const chain = pending ? await chainPrelude(db, table, pending, row) : false;
      const prelude = chain ? [...(pending?.prelude ?? []), pending!.payload] : pending?.prelude;
      const gen = chain ? (pending?.gen ?? 0) + 1
        : pending ? pending.gen
        : table === 'pr_events' && row.deleted_at == null ? await generationForNewPr(db, row) : undefined;
      const next: OutboxEntry = {
        ...(pending?.seq !== undefined ? { seq: pending.seq } : {}),
        table, row_id, payload: row, revision: newId(), status: 'pending',
        created_at: pending?.created_at ?? now, last_error: null,
      };
      if (prelude?.length) next.prelude = prelude;
      if (gen) next.gen = gen;
      await db.outbox.put(next);
    }
  });
}
export async function isPending(db: IronpactDB, rowId: string): Promise<boolean> {
  return (await db.outbox.where('row_id').equals(rowId).filter((entry) => entry.status === 'pending').count()) > 0;
}
