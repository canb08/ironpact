import type { SyncedTable } from '../core/types.ts';
import type { RemoteRow } from './adapter.ts';
import { type IronpactDB, rowKey } from './db.ts';
import { newId } from './ids.ts';

export interface Mutation { table: SyncedTable; row: RemoteRow; blob?: Blob }
/** May be nested in a broader transaction (session + child, or set + PR tombstones). */
export async function enqueue(db: IronpactDB, mutations: readonly Mutation[], now: string): Promise<void> {
  await db.transaction('rw', [...new Set(mutations.map(({ table }) => db.mirror(table))), db.outbox], async () => {
    for (const { table, row, blob } of mutations) {
      const row_id = rowKey(table, row);
      const existing = await db.outbox.where('[table+row_id]').equals([table, row_id]).toArray();
      const pending = existing.find((entry) => entry.status === 'pending');
      // A new user edit supersedes a dead payload too; it must not be replayable later.
      for (const entry of existing) if (entry.seq !== pending?.seq && entry.seq !== undefined) await db.outbox.delete(entry.seq);
      await db.mirror(table).put(row);
      await db.outbox.put({
        ...(pending?.seq !== undefined ? { seq: pending.seq } : {}), table, row_id, payload: row,
        ...(blob ? { blob } : {}), revision: newId(), status: 'pending', created_at: pending?.created_at ?? now, last_error: null,
      });
    }
  });
}
export async function isPending(db: IronpactDB, rowId: string): Promise<boolean> {
  return (await db.outbox.where('row_id').equals(rowId).filter((entry) => entry.status === 'pending').count()) > 0;
}
