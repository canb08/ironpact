import { v5 } from 'uuid';
import type { ProofCard, ProofCardWithMedia, ProofEntryRef, ProofKind, ProofLink, ProofPhoto, Result } from '../core/types.ts';
import { localDateSchema, proofCardSchema, proofPhotoSchema } from '../core/validate.ts';
import { imageDimensions, validImageBytes } from '../core/image.ts';
import type { ProofError, Remote, RepoProof, WriteError } from './adapter.ts';
import type { Clock } from './clock.ts';
import { type IronpactDB, asRemote } from './db.ts';
import { enqueue } from './outbox.ts';
import { prepareProofImage, type PreparedImage } from './image.ts';
const NS_PROOF = '9b056718-c58d-51c7-8abc-3261fc173e0a';
export const proofId = (key: string): string => v5(key, NS_PROOF);
class ProofFailure extends Error { constructor(readonly code: ProofError) { super(code); } }
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export function createProof(
  db: IronpactDB, remote: Remote, clock: Clock,
  write: <T>(fn: (user: string) => Promise<T>) => Promise<Result<T, WriteError>>,
  read: <T>(fn: () => Promise<T>) => Promise<T>,
  prepare: (blob: Blob) => Promise<PreparedImage> = prepareProofImage,
): { api: RepoProof; clear(): void } {
  const urls = new Map<string, { url: string; expires: number; object: boolean }>();
  function clear(): void {
    for (const item of urls.values()) if (item.object) URL.revokeObjectURL(item.url);
    urls.clear(); remote.proofStorage.clear();
  }
  async function mutate<T>(fn: (user: string) => Promise<T>): Promise<Result<T, ProofError>> {
    try { return await write(fn); } catch (error) {
      if (error instanceof ProofFailure) return { ok: false, error: error.code };
      throw error;
    }
  }
  async function cardForWrite(id: string, user: string, owner = false): Promise<ProofCard> {
    const card = await db.proof_cards.get(id);
    if (!card || card.deleted_at || !await db.crew_members.get([card.crew_id, user]).then((m) => m && m.left_at === null)) throw new ProofFailure('no_crew');
    if ((owner || !card.together) && card.created_by !== user) throw new ProofFailure('not_owner');
    return card;
  }
  async function ownEntry(ref: ProofEntryRef, user: string, kind: ProofKind, day: string): Promise<void> {
    const row = await db.mirror(ref.table).get(ref.id);
    const expected = ref.table === 'cardio_entries' ? 'run' : ref.table === 'martial_entries' ? 'muay_thai' : 'lift';
    if (!row || row.user_id !== user || row.deleted_at || row.local_date !== day || expected !== kind
      || (ref.table === 'sessions' && row.kind !== 'gym')
      || (ref.table === 'martial_entries' && row.discipline !== 'Muay Thai')) throw new ProofFailure('invalid_entry');
    if (ref.table === 'sets') {
      const parent = await db.sessions.get(String(row.session_id));
      if (!parent || parent.deleted_at || parent.kind !== 'gym') throw new ProofFailure('invalid_entry');
    }
  }
  const api: RepoProof = {
    listCards: (month) => read(async () => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
      const user = remote.currentUserId();
      if (!user) return [];
      const memberships = await db.crew_members.where('user_id').equals(user).filter((m) => m.left_at === null).toArray();
      const crews = new Set(memberships.map((m) => m.crew_id));
      const cards = await db.proof_cards.filter((c) => crews.has(c.crew_id) && !c.deleted_at && c.day.startsWith(month + '-')).toArray();
      return Promise.all(cards.sort((a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id)).map(async (card): Promise<ProofCardWithMedia> => ({
        ...card,
        links: await db.proof_links.where('card_id').equals(card.id).filter((l) => !l.deleted_at).toArray(),
        photos: await db.proof_photos.where('card_id').equals(card.id).filter((p) => !p.deleted_at).toArray(),
      })));
    }),
    createOrJoinCard: (input) => mutate(async (user) => {
      if (!localDateSchema.safeParse(input.day).success) throw new ProofFailure('invalid_entry');
      await ownEntry(input.entryRef, user, input.kind, input.day);
      const membership = await db.crew_members.where('user_id').equals(user).filter((m) => m.left_at === null).first();
      if (!membership) throw new ProofFailure('no_crew');
      const id = proofId(`card:${membership.crew_id}:${input.day}:${input.kind}:${input.together ? 'together' : user}`);
      const existing = await db.proof_cards.get(id);
      if (existing?.deleted_at) throw new ProofFailure('invalid_entry');
      const now = clock.now();
      const card: ProofCard = existing ?? {
        id, crew_id: membership.crew_id, kind: input.kind, day: input.day, together: input.together,
        caption: null, created_by: user, created_at: now, client_updated_at: now, deleted_at: null,
      };
      if (!proofCardSchema.safeParse(card).success) throw new ProofFailure('invalid_entry');
      const link: ProofLink = { id: proofId(`link:${id}:${user}:${input.entryRef.table}:${input.entryRef.id}`),
        card_id: id, entry_table: input.entryRef.table, entry_id: input.entryRef.id, user_id: user,
        created_at: now, client_updated_at: now, deleted_at: null };
      if (await db.proof_links.get(link.id)) return card;
      await enqueue(db, [...(!existing ? [{ table: 'proof_cards' as const, row: asRemote(card) }] : []),
        { table: 'proof_links', row: asRemote(link) }], now);
      return card;
    }),
    setCaption: (id, caption) => mutate(async (user) => {
      const card = { ...await cardForWrite(id, user, true), caption, client_updated_at: clock.now() };
      if (!proofCardSchema.safeParse(card).success) throw new ProofFailure('world_record');
      await enqueue(db, [{ table: 'proof_cards', row: asRemote(card) }], clock.now()); return card;
    }),
    async addPhoto(cardId, source) {
      const actor = remote.currentUserId();
      let image: PreparedImage;
      try {
        image = await prepare(source);
        const size = imageDimensions(image.width, image.height);
        if (!validImageBytes(image.blob.size) || image.blob.type !== 'image/jpeg'
          || size.width !== image.width || size.height !== image.height) throw new Error('invalid_image');
      } catch { return { ok: false, error: 'invalid_image' }; }
      return mutate(async (user) => {
        if (user !== actor) throw new ProofFailure('not_owner');
        const card = await cardForWrite(cardId, user);
        const id = proofId(`photo:${cardId}:${user}`);
        const old = await db.proof_photos.get(id);
        const now = clock.now();
        const photo: ProofPhoto = { id, card_id: cardId, user_id: user,
          storage_path: `${card.crew_id}/${cardId}/${user}.jpg`, width: image.width, height: image.height,
          bytes: image.blob.size, created_at: old?.created_at ?? now, client_updated_at: now, deleted_at: null };
        if (!proofPhotoSchema.safeParse(photo).success) throw new ProofFailure('invalid_image');
        await enqueue(db, [{ table: 'proof_photos', row: asRemote(photo), blob: image.blob }], now);
        clear(); return photo;
      });
    },
    removePhoto: (id) => mutate(async (user) => {
      const photo = await db.proof_photos.get(id);
      if (!photo || photo.user_id !== user) throw new ProofFailure('not_owner');
      await cardForWrite(photo.card_id, user);
      const now = clock.now();
      // Sync performs the idempotent Storage API removal before writing this tombstone.
      await enqueue(db, [{ table: 'proof_photos', row: asRemote({ ...photo, deleted_at: now, client_updated_at: now }) }], now);
      clear();
    }),
    photoUrl: (id) => read(async () => {
      const user = remote.currentUserId();
      const photo = await db.proof_photos.get(id);
      const card = photo && await db.proof_cards.get(photo.card_id);
      const member = card && user && await db.crew_members.get([card.crew_id, user]);
      if (!photo || photo.deleted_at || !card || card.deleted_at || !member || member.left_at !== null) return { ok: false, error: 'network' };
      const queued = await db.outbox.where('[table+row_id]').equals(['proof_photos', id]).first();
      const key = `${user}:${id}:${queued?.revision ?? photo.client_updated_at}`;
      const cached = urls.get(key);
      if (cached && cached.expires > Date.parse(clock.now())) return ok(cached.url);
      if (cached?.object) URL.revokeObjectURL(cached.url);
      if (queued?.blob) {
        const url = URL.createObjectURL(queued.blob);
        urls.set(key, { url, expires: Infinity, object: true }); return ok(url);
      }
      const result = await remote.proofStorage.signedUrl(photo.storage_path, 300);
      if (user !== remote.currentUserId()) return { ok: false, error: 'network' };
      if (result.ok) urls.set(key, { url: result.value, expires: Date.parse(clock.now()) + 240_000, object: false });
      return result;
    }),
  };
  return { api, clear };
}
