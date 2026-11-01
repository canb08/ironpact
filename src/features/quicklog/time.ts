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

export function formatPace(durationS: number, km: number): string {
  const total = Math.round(durationS / km);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
