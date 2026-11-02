/** Format stored calendar dates without timezone conversion. The caller supplies today. */
export function formatDate(date: string, today: string, labels: { x5Today: string; x5Yesterday: string }): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return date;
  if (date === today) return labels.x5Today;
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (Number.isFinite(yesterday.getTime()) && yesterday.toISOString().slice(0, 10) === date) return labels.x5Yesterday;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short',
    ...(sameYear ? { weekday: 'short' } : { year: 'numeric' }),
  }).format(parsed);
  return parts.replace(',', '');
}
