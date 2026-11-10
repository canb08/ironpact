import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRemote, MOCK_USER_IDS } from '../../../src/data/adapter.mock.ts';
import { createClock } from '../../../src/data/clock.ts';
import { IronpactDB } from '../../../src/data/db.ts';
import { createDataRepo, type ManagedRepo } from '../../../src/data/repo.ts';
import { deferred, ManualEnvironment, unwrap } from './harness.ts';

describe('Proof through the full mock Repo/outbox/sync pipeline', () => {
  let db: IronpactDB;
  let repo: ManagedRepo;
  let remote: ReturnType<typeof createMockRemote>;
  let env: ManualEnvironment;
  const time = Date.parse('2026-11-05T12:00:00Z');
  const image = () => new Blob(['jpeg pixels'], { type: 'image/jpeg' });
  async function card() {
    const run = unwrap(await repo.w.logRun({ distance_m: 5000, duration_s: 1800 }));
    return unwrap(await repo.proof.createOrJoinCard({ day: run.local_date, kind: 'run', together: true, entryRef: { table: 'cardio_entries', id: run.id } }));
  }
  beforeEach(async () => {
    db = new IronpactDB(`proof-${crypto.randomUUID()}`);
    env = new ManualEnvironment(); env.setOnline(true);
    remote = createMockRemote({ now: () => time });
    repo = createDataRepo(remote, { db, environment: env, clock: createClock({ now: () => time, timezone: () => 'Europe/Amsterdam' }), autoStart: false,
      prepareProofImage: async (blob) => ({ blob, width: 800, height: 1200 }) });
    await repo.ready; await repo.sync.pullNow();
  });
  afterEach(async () => { repo.close(); await db.delete(); vi.restoreAllMocks(); });

  it('persists a photo offline across a reopen, reconnects, and uploads once under concurrent flushes', async () => {
    const c = await card();
    env.setOnline(false);
    const upload = vi.spyOn(remote.proofStorage, 'upload');
    const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    await repo.sync.flushNow();
    expect(upload).not.toHaveBeenCalled();
    const queued = await db.outbox.where('row_id').equals(photo.id).first();
    expect(queued).not.toHaveProperty('blob');
    expect(queued?.photo).toEqual({ data: await image().arrayBuffer(), mimeType: 'image/jpeg',
      width: 800, height: 1200, bytes: image().size });
    expect(queued?.photo?.data).toBeInstanceOf(ArrayBuffer);
    repo.close(); db.close(); await db.open();
    repo = createDataRepo(remote, { db, environment: env, autoStart: false }); await repo.ready;
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    expect(unwrap(await repo.proof.photoUrl(photo.id))).toMatch(/^blob:/);
    const preview = createUrl.mock.calls[0]![0] as Blob;
    expect(preview.type).toBe('image/jpeg');
    expect(await preview.arrayBuffer()).toEqual(await image().arrayBuffer());
    env.setOnline(true);
    await Promise.all([repo.sync.flushNow(), repo.sync.flushNow(), repo.sync.flushNow()]);
    expect(upload).toHaveBeenCalledTimes(1);
    const uploaded = upload.mock.calls[0]![1];
    expect(uploaded.type).toBe('image/jpeg');
    expect(await uploaded.arrayBuffer()).toEqual(await image().arrayBuffer());
    expect(remote.inspect('proof_photos')).toHaveLength(1);
    expect(await db.outbox.count()).toBe(0);
    await repo.sync.flushNow(); expect(upload).toHaveBeenCalledTimes(1);
    expect((await repo.proof.listCards('2026-11'))[0]?.photos).toHaveLength(1);
    expect((await repo.proof.photoUrl(photo.id)).ok).toBe(true);
    expect(JSON.stringify(await db.proof_photos.toArray())).not.toContain('blob:');
  });

  it('reopens legacy Blob-only entries for local preview and upload without losing their bytes', async () => {
    const c = await card(); env.setOnline(false);
    const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    const legacy = (await db.outbox.where('row_id').equals(photo.id).first())!;
    delete legacy.photo;
    legacy.blob = image();
    await db.outbox.put(legacy);
    repo.close(); db.close(); await db.open();
    repo = createDataRepo(remote, { db, environment: env, autoStart: false }); await repo.ready;
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    expect(unwrap(await repo.proof.photoUrl(photo.id))).toMatch(/^blob:/);
    const preview = createUrl.mock.calls[0]![0] as Blob;
    expect(preview.type).toBe('image/jpeg');
    expect(await preview.arrayBuffer()).toEqual(await image().arrayBuffer());
    const upload = vi.spyOn(remote.proofStorage, 'upload');
    env.setOnline(true); await repo.sync.flushNow();
    expect(upload).toHaveBeenCalledExactlyOnceWith(photo.storage_path, expect.any(Blob));
    const uploaded = upload.mock.calls[0]![1];
    expect(uploaded.type).toBe('image/jpeg');
    expect(await uploaded.arrayBuffer()).toEqual(await image().arrayBuffer());
    expect(await db.outbox.count()).toBe(0);
  });

  it('replaces a legacy queued Blob with bytes when the photo is edited offline', async () => {
    const c = await card(); env.setOnline(false);
    const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    const legacy = (await db.outbox.where('row_id').equals(photo.id).first())!;
    delete legacy.photo;
    legacy.blob = image();
    await db.outbox.put(legacy);
    const replacement = new Blob(['replacement jpeg'], { type: 'image/jpeg' });
    unwrap(await repo.proof.addPhoto(c.id, replacement));
    const queued = await db.outbox.where('row_id').equals(photo.id).toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).not.toHaveProperty('blob');
    expect(queued[0]?.photo?.data).toEqual(await replacement.arrayBuffer());
    expect(queued[0]?.seq).toBe(legacy.seq);
  });

  it('deletes the Storage object before acknowledging the tombstone, retaining failures for retry', async () => {
    const c = await card(); const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    await repo.sync.flushNow();
    const remove = vi.spyOn(remote.proofStorage, 'remove');
    remove.mockResolvedValueOnce({ ok: false, error: { kind: 'transient', status: 503, message: 'offline' } });
    unwrap(await repo.proof.removePhoto(photo.id));
    await repo.sync.flushNow();
    expect((await db.outbox.where('row_id').equals(photo.id).first())?.status).toBe('pending');
    expect(remote.inspect('proof_photos')[0]?.deleted_at).toBeNull();
    expect((await remote.proofStorage.signedUrl(photo.storage_path, 300)).ok).toBe(true);
    await repo.sync.flushNow();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remote.inspect('proof_photos')[0]?.deleted_at).not.toBeNull();
    expect(await db.outbox.count()).toBe(0);
    expect((await remote.proofStorage.signedUrl(photo.storage_path, 300)).ok).toBe(false);
  });

  it('offline add then remove coalesces to a deletion without ever uploading bytes', async () => {
    const c = await card(); env.setOnline(false);
    const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    unwrap(await repo.proof.removePhoto(photo.id));
    const upload = vi.spyOn(remote.proofStorage, 'upload');
    env.setOnline(true); await repo.sync.flushNow();
    expect(upload).not.toHaveBeenCalled();
    expect(remote.inspect('proof_photos')[0]?.deleted_at).not.toBeNull();
  });

  it('retries a lost metadata acknowledgement with the same storage path and photo identity', async () => {
    const c = await card(); await repo.sync.flushNow();
    const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    remote.failNext(1, 'transient'); await repo.sync.flushNow();
    expect(await db.outbox.count()).toBe(1);
    await repo.sync.flushNow();
    expect(remote.inspect('proof_photos').map((p) => p.id)).toEqual([photo.id]);
    expect(await db.outbox.count()).toBe(0);
  });

  it('an edit during upload stays queued; a following removal deletes the in-flight upload', async () => {
    const c = await card(); await repo.sync.flushNow();
    const photo = unwrap(await repo.proof.addPhoto(c.id, image()));
    const entered = deferred<void>(); const release = deferred<void>();
    const upload = remote.proofStorage.upload;
    vi.spyOn(remote.proofStorage, 'upload').mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return upload(...args); });
    const flushing = repo.sync.flushNow(); await entered.promise;
    unwrap(await repo.proof.removePhoto(photo.id)); release.resolve(); await flushing;
    expect((await remote.proofStorage.signedUrl(photo.storage_path, 300)).ok).toBe(false);
    expect(remote.inspect('proof_photos')[0]?.deleted_at).not.toBeNull();
    expect(await db.outbox.count()).toBe(0);
  });

  it('two offline partners converge on one together card, own links, and one photo each', async () => {
    const first = await card(); const mine = unwrap(await repo.proof.addPhoto(first.id, image()));
    await repo.sync.flushNow();
    await repo.auth.verifyCode('bob@example.test', '123456'); await repo.sync.pullNow();
    const second = await card(); expect(second.id).toBe(first.id);
    expect(await repo.proof.removePhoto(mine.id)).toEqual({ ok: false, error: 'not_owner' });
    expect(await repo.proof.setCaption(first.id, 'No')).toEqual({ ok: false, error: 'not_owner' });
    const theirs = unwrap(await repo.proof.addPhoto(second.id, image())); await repo.sync.flushNow();
    expect(theirs.id).not.toBe(mine.id);
    expect(remote.inspect('proof_cards')).toHaveLength(1);
    expect(remote.inspect('proof_links')).toHaveLength(2);
    expect(remote.inspect('proof_photos')).toHaveLength(2);
  });

  it('a partner who has not pulled the card can concurrently create the same together id', async () => {
    const first = await card(); await repo.sync.flushNow();
    await repo.auth.verifyCode('bob@example.test', '123456'); await repo.sync.pullNow();
    await db.proof_cards.clear(); await db.proof_links.clear();
    const second = await card(); expect(second.id).toBe(first.id);
    await repo.sync.flushNow();
    expect(remote.inspect('proof_cards')).toHaveLength(1);
    expect((await db.proof_cards.get(first.id))?.created_by).toBe(MOCK_USER_IDS.alice);
    expect(remote.inspect('proof_links')).toHaveLength(2);
    expect(await db.outbox.count()).toBe(0);
  });

  it('rejects a foreign entry locally and at the remote policy seam', async () => {
    const c = await card(); await repo.sync.flushNow();
    const link = remote.inspect('proof_links')[0]!;
    await repo.auth.verifyCode('bob@example.test', '123456'); await repo.sync.pullNow();
    expect(await repo.proof.createOrJoinCard({ day: c.day, kind: 'run', together: true, entryRef: { table: 'cardio_entries', id: String(link.entry_id) } })).toEqual({ ok: false, error: 'invalid_entry' });
    const response = await remote.upsert('proof_links', [{ ...link, id: crypto.randomUUID(), user_id: MOCK_USER_IDS.bob }]);
    expect(response.ok).toBe(false);
  });

  it('replacement reuses the identity and rejects invalid images and overlong captions', async () => {
    const c = await card();
    const first = unwrap(await repo.proof.addPhoto(c.id, image()));
    const second = unwrap(await repo.proof.addPhoto(c.id, image()));
    expect(second.id).toBe(first.id);
    expect(await db.proof_photos.count()).toBe(1);
    expect(await repo.proof.addPhoto(c.id, new Blob(['bad'], { type: 'image/png' }))).toEqual({ ok: false, error: 'invalid_image' });
    expect(await repo.proof.addPhoto(c.id, new Blob([new Uint8Array(5_000_001)], { type: 'image/jpeg' }))).toEqual({ ok: false, error: 'invalid_image' });
    expect(await repo.proof.setCaption(c.id, 'x'.repeat(81))).toEqual({ ok: false, error: 'world_record' });
    expect(unwrap(await repo.proof.setCaption(c.id, '💪'.repeat(80))).caption).toHaveLength(160);
  });
});
