import { PULLED_TABLES } from '../core/types.ts';
import type { KeysetCursor, Remote, RemoteRow } from './adapter.ts';
import { type IronpactDB, mirrorRow, primaryKey, rowKey, SNAPSHOT_TABLES, SNAPSHOT_TIMESTAMP } from './db.ts';
import { compareInstant } from './clock.ts';

export function cursorFor(table: (typeof PULLED_TABLES)[number], row: RemoteRow): KeysetCursor {
  if (SNAPSHOT_TABLES.has(table)) return { updated_at: SNAPSHOT_TIMESTAMP, id: rowKey(table, row) };
  if (typeof row.updated_at !== 'string') throw new Error(`Remote must supply a cursor timestamp for ${table}`);
  return { updated_at: row.updated_at, id: rowKey(table, row) };
}
export function compareCursor(a: KeysetCursor, b: KeysetCursor): number {
  return compareInstant(a.updated_at, b.updated_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function isCursor(value: unknown): value is KeysetCursor {
  return typeof value === 'object' && value !== null && 'updated_at' in value && typeof value.updated_at === 'string' && 'id' in value && typeof value.id === 'string';
}
export async function pullAll(db: IronpactDB, remote: Remote, alive: () => boolean = () => true): Promise<boolean> {
  for (const table of PULLED_TABLES) {
    if (!alive()) return false;
    const key = `last_pulled_at:${table}`;
    const saved = (await db.meta.get(key))?.value;
    let maximum = isCursor(saved) ? saved : null;
    const snapshot = SNAPSHOT_TABLES.has(table);
    const seen = new Set<string>();
    const initial = new Map(snapshot ? (await db.mirror(table).toArray()).map((row) => [rowKey(table, row), JSON.stringify(row)]) : []);
    const initiallyQueued = new Set(snapshot ? (await db.outbox.filter((entry) => entry.table === table).toArray()).map((entry) => entry.row_id) : []);
    let cursor: KeysetCursor | null = !snapshot && maximum ? { updated_at: new Date(Date.parse(maximum.updated_at) - 5000).toISOString(), id: '' } : null;
    while (alive()) {
      const response = await remote.pullPage(table, cursor, 1000);
      if (!alive() || !response.ok) return false;
      const rows = response.value;
      if (!rows.length) break;
      const end = cursorFor(table, rows[rows.length - 1]!);
      if (cursor && compareCursor(end, cursor) <= 0) throw new Error(`Remote cursor did not advance: ${table}`);
      await db.transaction('rw', db.mirror(table), db.outbox, db.meta, async () => {
        if (!alive()) return;
        for (const row of rows) {
          const pending = await db.outbox.where('[table+row_id]').equals([table, rowKey(table, row)]).filter((entry) => entry.status === 'pending').count();
          seen.add(rowKey(table, row));
          if (!pending) await db.mirror(table).put(mirrorRow(table, row));
        }
        if (!maximum || compareCursor(end, maximum) > 0) maximum = end;
        await db.meta.put({ key, value: maximum });
      });
      cursor = end;
      if (rows.length < 1000) break;
    }
    if (snapshot && alive()) await db.transaction('rw', db.mirror(table), db.outbox, async () => {
      if (!alive()) return;
      for (const row of await db.mirror(table).toArray()) {
        const id = rowKey(table, row);
        if (!seen.has(id) && !initiallyQueued.has(id) && initial.get(id) === JSON.stringify(row) && !await db.outbox.where('[table+row_id]').equals([table, id]).count()) await db.mirror(table).delete(primaryKey(table, row));
      }
    });
  }
  return alive();
}
