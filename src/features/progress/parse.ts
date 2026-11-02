/** Duration and number parsing for S14/S15 fields. Range checks stay in core/validate.ts. */
export function parseDuration(input: string): number | null {
  const match = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(input.trim());
  if (!match) return null;
  const head = Number(match[1]);
  const mid = Number(match[2]);
  const tail = match[3];
  if (tail === undefined) return head * 60 + mid;
  return head * 3600 + mid * 60 + Number(tail);
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function parseDecimal(input: string): number | null {
  const text = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function parseInteger(input: string): number | null {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

export function codePoints(value: string): number {
  return Array.from(value).length;
}
