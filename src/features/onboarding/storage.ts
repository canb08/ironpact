// Per-account, per-device hints. Storage restrictions must never block setup.
export function hintSeen(kind: 'guide' | 'name', userId: string): boolean {
  try { return localStorage.getItem(`ironpact.x9.${kind}.${userId}`) === '1'; }
  catch { return false; }
}
export function rememberHint(kind: 'guide' | 'name', userId: string): void {
  try { localStorage.setItem(`ironpact.x9.${kind}.${userId}`, '1'); }
  catch { /* Keep this visit usable when storage is unavailable. */ }
}
