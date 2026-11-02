/** Local "seen once" key: week start plus crew id (§3.9.1). */
export function ringCloseKey(crewId: string, weekStart: string): string {
  return `${crewId}:${weekStart}`;
}

export function ringCloseMomentId(crewId: string, weekStart: string): string {
  return `ring-close:${ringCloseKey(crewId, weekStart)}`;
}

const STORAGE_KEY = 'ironpact.ring-close.seen';

function canStore(): boolean {
  return typeof localStorage !== 'undefined';
}

export function readIdList(key: string): string[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function writeIdList(key: string, ids: readonly string[]): void {
  if (!canStore()) return;
  const unique = [...new Set(ids)];
  localStorage.setItem(key, JSON.stringify(unique));
}

export function ringCloseWasSeen(crewId: string, weekStart: string): boolean {
  return readIdList(STORAGE_KEY).includes(ringCloseKey(crewId, weekStart));
}

export function rememberRingClose(crewId: string, weekStart: string): void {
  const key = ringCloseKey(crewId, weekStart);
  const seen = readIdList(STORAGE_KEY);
  if (!seen.includes(key)) writeIdList(STORAGE_KEY, [...seen, key]);
}

export function resetRingCloseForTests(): void {
  if (canStore()) localStorage.removeItem(STORAGE_KEY);
}
