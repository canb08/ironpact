/** Calendar dates as YYYY-MM-DD, shifted in UTC so a zone offset cannot skip a day. */
export function shiftDate(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 14-day strip centred on the open day (6 before, 7 after). */
export function windowDates(center: string): string[] {
  const days: string[] = [];
  for (let offset = -6; offset <= 7; offset += 1) days.push(shiftDate(center, offset));
  return days;
}
