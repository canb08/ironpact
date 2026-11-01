import type { FeedItem } from '../../data/adapter.ts';
import type { Profile } from '../../core/types.ts';

export interface FeedGroup { id: string; user: string; date: string; sets: boolean; items: FeedItem[] }

export function groupFeed(items: FeedItem[], partners: Profile[]): FeedGroup[] {
  const profiles = new Map(partners.map((p) => [p.id, p]));
  const groups = new Map<string, FeedGroup>();
  const time = (item: FeedItem) => item.type === 'weight' ? item.row.measured_at : item.row.logged_at;
  const visible = items.filter((item) => profiles.has(item.row.user_id) && !item.row.deleted_at &&
    (item.type !== 'weight' || profiles.get(item.row.user_id)?.show_bodyweight === true));
  visible.sort((a, b) => time(b).localeCompare(time(a)));
  for (const item of visible.slice(0, 20)) {
    const id = item.type === 'set' ? `session:${item.row.user_id}:${item.row.session_id}` : `${item.type}:${item.row.id}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, user: item.row.user_id, date: item.row.local_date, sets: item.type === 'set', items: [] };
      groups.set(id, group);
    }
    group.items.push(item);
  }
  for (const group of groups.values()) {
    if (group.sets) group.items.sort((a, b) => a.type === 'set' && b.type === 'set' ? a.row.set_index - b.row.set_index : 0);
  }
  return [...groups.values()];
}
