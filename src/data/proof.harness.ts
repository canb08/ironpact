/** Dev-only browser probe for Y8's data flow; no route or product UI. */
import { createMockRemote } from './adapter.mock.ts';
import { IronpactDB } from './db.ts';
import { createDataRepo } from './repo.ts';
if (!import.meta.env.DEV) throw new Error('Development harness only');
const remote = createMockRemote();
const name = `proof-browser-${crypto.randomUUID()}`;
let db = new IronpactDB(name);
let repo = createDataRepo(remote, { db, autoStart: false });
let uploads = 0;
const upload = remote.proofStorage.upload;
remote.proofStorage.upload = async (...args) => { uploads++; return upload(...args); };
let photoId = '';
export async function setup(): Promise<void> { await repo.ready; await repo.sync.pullNow(); }
export async function queueOffline() {
  const entry = await repo.w.logRun({ distance_m: 5000, duration_s: 1800 });
  if (!entry.ok) throw new Error(entry.error);
  const card = await repo.proof.createOrJoinCard({ kind: 'run', day: entry.value.local_date, together: true, entryRef: { table: 'cardio_entries', id: entry.value.id } });
  if (!card.ok) throw new Error(card.error);
  const canvas = document.createElement('canvas'); canvas.width = 4000; canvas.height = 3000;
  const context = canvas.getContext('2d')!; context.fillStyle = '#2563c9'; context.fillRect(0, 0, 4000, 3000);
  const source = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  const photo = await repo.proof.addPhoto(card.value.id, source);
  if (!photo.ok) throw new Error(photo.error);
  photoId = photo.value.id;
  const localUrl = await repo.proof.photoUrl(photoId);
  if (!localUrl.ok) throw new Error(localUrl.error);
  const localImage = new Image(); localImage.src = localUrl.value; await localImage.decode();
  await repo.sync.flushNow();
  const queued = await db.outbox.where('row_id').equals(photoId).first();
  const state = { uploads, type: queued?.blob?.type, width: localImage.naturalWidth, height: localImage.naturalHeight, bytes: queued?.blob?.size };
  repo.close(); db.close(); db = new IronpactDB(name); repo = createDataRepo(remote, { db, autoStart: false }); await repo.ready;
  return state;
}
export async function reconnect() {
  await Promise.all([repo.sync.flushNow(), repo.sync.flushNow(), repo.sync.flushNow()]);
  await repo.sync.flushNow();
  const result = { uploads, serverPhotos: remote.inspect('proof_photos').length, pending: await db.outbox.count() };
  const removed = await repo.proof.removePhoto(photoId); if (!removed.ok) throw new Error(removed.error);
  await repo.sync.flushNow();
  const photo = await db.proof_photos.get(photoId);
  const absent = photo && !(await remote.proofStorage.signedUrl(photo.storage_path, 300)).ok;
  repo.close(); await db.delete();
  return { ...result, removedFromStorage: absent };
}
