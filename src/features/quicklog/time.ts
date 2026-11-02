/** Plain `mm:ss` or `h:mm:ss`. Range checks stay in core/validate.ts. */
export function parseDuration(input: string): number | null {
  const match = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(input.trim());
  if (!match) return null;
  const head = Number(match[1]);
  const mid = Number(match[2]);
  if (match[3] === undefined) return head * 60 + mid;
  return head * 3600 + mid * 60 + Number(match[3]);
}

export function parseDecimal(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function parseInteger(input: string): number | null {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** `mm:ss`, or `h:mm:ss` once the run crosses an hour. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const clock = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

/** One decimal on a 0.1 km detent, two when the value sits between detents. */
export function formatKm(km: number): string {
  const hundredths = Math.round(km * 100);
  const text = (hundredths / 100).toFixed(2);
  return text.endsWith('0') ? (hundredths / 100).toFixed(1) : text;
}

export function formatPace(durationS: number, km: number): string {
  const total = Math.round(durationS / km);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

