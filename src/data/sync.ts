import { SYNCED_TABLES } from '../core/types.ts';
import type { Remote, RemoteWriteError, SyncStatus, Unsubscribe } from './adapter.ts';
import type { Clock } from './clock.ts';
import { type IronpactDB, type OutboxEntry, mirrorRow, rowKey } from './db.ts';
import { pullAll } from './pull.ts';

// Distinct controllers over the same IndexedDB database must never send the same queue concurrently.
const databaseFlights = new Map<string, Promise<void>>();

export interface SyncEnvironment {
  online(): boolean;
  visible(): boolean;
  onOnline(cb: () => void): Unsubscribe;
  onVisibility(cb: () => void): Unsubscribe;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export function browserEnvironment(): SyncEnvironment {
  return {
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
    onOnline(cb) {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('online', cb); window.addEventListener('offline', cb);
      return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
    },
    onVisibility(cb) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

/** One controller per repo; close invalidates responses even though Remote has no abort parameter. */
export class SyncEngine {
  private state: SyncStatus;
  private listeners = new Set<(status: SyncStatus) => void>();
  private flight: Promise<void> | null = null;
  private pulling: Promise<void> | null = null;
  private generation = 0;
  private closed = false;
  private failures = 0;
  private retryAt = 0;
  private retryTimer: unknown;
  private periodicTimer: unknown;
  private unsubscribers: Unsubscribe[] = [];
  private calibrated = false;
  private automatic = false;

  constructor(private db: IronpactDB, private remote: Remote, private clock: Clock, private env: SyncEnvironment) {
    this.state = { state: env.online() ? 'idle' : 'offline', pendingCount: 0, deadCount: 0, lastSyncedAt: null };
  }
  status(): SyncStatus { return { ...this.state, state: !this.env.online() ? 'offline' : this.state.state }; }
  onStatus(cb: (status: SyncStatus) => void): Unsubscribe { this.listeners.add(cb); cb(this.status()); return () => { this.listeners.delete(cb); }; }
  private emit(): void { for (const cb of this.listeners) cb(this.status()); }
  async refresh(): Promise<void> {
    const [pendingCount, deadCount] = await Promise.all([
      this.db.outbox.where('status').equals('pending').count(), this.db.outbox.where('status').equals('dead').count(),
    ]);
    if (this.closed) return;
    this.state = { ...this.state, pendingCount, deadCount }; this.emit();
  }
  invalidate(): void {
    this.generation++; this.failures = 0; this.retryAt = 0;
    this.env.clearTimeout(this.retryTimer); this.flight = null; this.pulling = null;
    this.state = { state: this.env.online() ? 'idle' : 'offline', pendingCount: 0, deadCount: 0, lastSyncedAt: null };
    this.emit();
  }
  close(): void {
    this.closed = true; this.invalidate();
    this.env.clearTimeout(this.periodicTimer);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.listeners.clear();
  }
  start(): void {
    if (this.automatic || this.closed) return;
    this.automatic = true;
    const trigger = () => { if (this.env.visible()) this.kick(); };
    this.unsubscribers.push(this.env.onOnline(() => this.kick()), this.env.onVisibility(trigger));
    const tick = () => { if (this.closed) return; trigger(); this.periodicTimer = this.env.setTimeout(tick, 30_000); };
    this.periodicTimer = this.env.setTimeout(tick, 30_000);
    this.kick();
  }
  afterWrite(): void { void this.refresh().catch(() => {}); if (this.automatic) this.kick(); }
  private kick(): void {
    if (this.closed) return;
    if (!this.env.online()) { this.state.state = 'offline'; this.emit(); return; }
    if (Date.parse(this.clock.now()) < this.retryAt) return;
    void this.flushNow().then(() => this.pullNow()).catch(() => {});
  }
  async calibrate(alive: () => boolean = () => !this.closed): Promise<void> {
    if (this.calibrated || !this.env.online()) return;
    const offset = await this.clock.calibrate(() => this.remote.serverNow());
    if (!alive()) return;
    await this.db.meta.put({ key: 'clock_offset_ms', value: offset });
    if (Math.abs(offset) > 600_000) await this.db.meta.put({ key: 'phone_clock_off', value: true });
    this.calibrated = true;
  }
  flushNow(): Promise<void> {
    if (this.flight) return this.flight;
    const generation = this.generation;
    const userId = this.remote.currentUserId();
    const alive = () => !this.closed && generation === this.generation && userId !== null && userId === this.remote.currentUserId();
    const previous = databaseFlights.get(this.db.name);
    const task = (async () => { if (previous) await previous.catch(() => {}); await this.flush(alive); })().finally(() => {
      if (this.flight === task) this.flight = null;
      if (databaseFlights.get(this.db.name) === task) databaseFlights.delete(this.db.name);
    });
    this.flight = task;
    databaseFlights.set(this.db.name, task);
    return task;
  }
  private async transient(error: RemoteWriteError, alive: () => boolean): Promise<void> {
    if (!alive()) return;
    this.failures++;
    const delay = Math.min(60, 2 ** this.failures) * 1000;
    this.retryAt = Date.parse(this.clock.now()) + delay;
    this.state.state = this.failures >= 3 ? 'server_asleep' : 'idle';
    // The payload remains pending; errors are diagnostics, never a destructive queue transition.
    await this.db.meta.put({ key: 'last_sync_error', value: error.message });
    this.env.clearTimeout(this.retryTimer);
    if (this.automatic) this.retryTimer = this.env.setTimeout(() => { this.retryAt = 0; this.kick(); }, delay);
  }
  private async batch(entries: OutboxEntry[], alive: () => boolean): Promise<boolean> {
    if (!alive() || !entries.length) return alive();
    const table = entries[0]!.table;
    // Storage and metadata share one outbox acknowledgement/retry lifecycle.
    // A failed delete can never be acknowledged as a removed photo.
    if (table === 'proof_photos') {
      for (const entry of entries) {
        if (!alive()) return false;
        const path = String(entry.payload.storage_path);
        let result;
        try { result = entry.payload.deleted_at
          ? await this.remote.proofStorage.remove(path)
          : entry.blob ? await this.remote.proofStorage.upload(path, entry.blob)
          : { ok: true as const, value: undefined }; }
        catch { result = { ok: false as const, error: { kind: 'transient' as const, status: null, message: 'Storage unavailable' } }; }
        if (!alive()) return false;
        if (!result.ok) {
          if (result.error.kind === 'transient') { await this.transient(result.error, alive); return false; }
          if (entry.seq !== undefined) await this.db.transaction('rw', this.db.outbox, async () => {
            const current = await this.db.outbox.get(entry.seq!);
            if (alive() && current?.revision === entry.revision) await this.db.outbox.update(entry.seq!, { status: 'dead', last_error: result.error.message });
          });
          return true;
        }
      }
    }
    let response;
    try { response = await this.remote.upsert(table, entries.map((entry) => entry.payload)); }
    catch { response = { ok: false as const, error: { kind: 'transient' as const, status: null, message: 'network' } }; }
    if (!alive()) return false;
    if (!response.ok) {
      if (response.error.kind === 'transient') { await this.transient(response.error, alive); return false; }
      if (entries.length > 1) {
        const midpoint = Math.floor(entries.length / 2);
        if (!await this.batch(entries.slice(0, midpoint), alive)) return false;
        return this.batch(entries.slice(midpoint), alive);
      }
      const sent = entries[0]!;
      const message = response.error.message;
      await this.db.transaction('rw', this.db.outbox, async () => {
        if (!alive() || sent.seq === undefined) return;
        const current = await this.db.outbox.get(sent.seq);
        if (current?.revision === sent.revision) await this.db.outbox.update(sent.seq, { status: 'dead', last_error: message });
      });
      return true;
    }
    const acknowledged = new Map(response.value.map((row) => [rowKey(table, row), row]));
    const missing = entries.filter((entry) => !acknowledged.has(entry.row_id)).map((entry) => entry.row_id);
    if (missing.length) {
      let fetched;
      try { fetched = await this.remote.fetchByIds(table, missing); } catch { fetched = { ok: false as const, error: 'network' as const }; }
      if (!alive()) return false;
      if (fetched.ok) for (const row of fetched.value) acknowledged.set(rowKey(table, row), row);
      if (!fetched.ok || missing.some((id) => !acknowledged.has(id))) {
        await this.transient({ kind: 'transient', status: null, message: 'Missing server acknowledgement' }, alive);
        return false;
      }
    }
    await this.db.transaction('rw', this.db.mirror(table), this.db.outbox, async () => {
      if (!alive()) return;
      for (const sent of entries) {
        if (sent.seq === undefined) continue;
        const current = await this.db.outbox.get(sent.seq);
        // A local edit during the request owns the mirror and must remain queued.
        if (current?.revision !== sent.revision || current.status !== 'pending') continue;
        const row = acknowledged.get(sent.row_id);
        if (row) { await this.db.mirror(table).put(mirrorRow(table, row)); await this.db.outbox.delete(sent.seq); }
      }
    });
    this.failures = 0; this.retryAt = 0;
    return true;
  }
  private async flush(alive: () => boolean): Promise<void> {
    if (!alive()) return;
    if (!this.env.online()) { this.state.state = 'offline'; await this.refresh(); return; }
    this.state.state = 'flushing'; this.emit();
    try {
      await this.calibrate(alive);
      while (alive()) {
        const pending = await this.db.outbox.where('status').equals('pending').toArray();
        const table = SYNCED_TABLES.find((candidate) => pending.some((entry) => entry.table === candidate));
        if (!table) break;
        const entries = pending.filter((entry) => entry.table === table).slice(0, table === 'proof_photos' ? 1 : 100);
        if (!await this.batch(entries, alive)) return;
      }
      if (alive()) { this.state.state = 'idle'; this.state.lastSyncedAt = this.clock.now(); }
    } catch {
      await this.transient({ kind: 'transient', status: null, message: 'network or local storage unavailable' }, alive);
    } finally {
      if (alive()) await this.refresh();
    }
  }
  pullNow(): Promise<void> {
    if (this.pulling) return this.pulling;
    const generation = this.generation;
    const user = this.remote.currentUserId();
    const alive = () => !this.closed && generation === this.generation && user !== null && this.remote.currentUserId() === user;
    const task = (async () => {
      if (!alive() || !this.env.online()) return;
      try { await this.calibrate(alive); await pullAll(this.db, this.remote, alive); } catch { /* Retry on the next foreground/online trigger. */ }
      if (alive()) await this.refresh();
    })().finally(() => { if (this.pulling === task) this.pulling = null; });
    this.pulling = task;
    return task;
  }
}
