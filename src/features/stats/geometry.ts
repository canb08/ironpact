import { rebaseToFirst } from '../../core/duel.ts';
import type { LocalDate } from '../../core/types.ts';
import type { TrendWindow } from './trend.ts';

export interface DatedValue {
  date: LocalDate;
  value: number;
}

function ordinal(date: LocalDate): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Each series becomes a percent of its own first positive value. Non-finite values drop out. */
export function rebaseSeries(points: readonly DatedValue[]): DatedValue[] {
  const scaled = rebaseToFirst(points.map((point) => point.value));
  const dated: DatedValue[] = [];
  points.forEach((point, index) => {
    const value = scaled[index];
    if (value == null) return;
    dated.push({ date: point.date, value });
  });
  return dated;
}

/**
 * Plain SVG polyline coordinates. X is the date inside the window, not a fabricated index.
 * One returned string per input series. Shared Y domain, so overlaid lines stay comparable.
 */
export function plotDated(
  series: readonly (readonly DatedValue[])[],
  window: TrendWindow,
  width: number,
  height: number,
  padX = 28,
  padY = 20,
): string[] {
  const values: number[] = [];
  for (const line of series) {
    for (const point of line) {
      if (Number.isFinite(point.value)) values.push(point.value);
    }
  }
  const first = values[0];
  let min = first ?? 0;
  let max = first ?? 1;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const spanDays = Math.max(1, ordinal(window.to) - ordinal(window.from));
  const ySpan = max - min;
  return series.map((line) => {
    const counts = new Map<string, number>();
    for (const point of line) counts.set(point.date, (counts.get(point.date) ?? 0) + 1);
    const seen = new Map<string, number>();
    return line.map((point) => {
      const order = seen.get(point.date) ?? 0;
      seen.set(point.date, order + 1);
      const count = counts.get(point.date) ?? 1;
      const bump = count <= 1 ? 0 : (order / count) * 0.8;
      const t = Math.min(1, Math.max(0, (ordinal(point.date) - ordinal(window.from) + bump) / spanDays));
      const yFrac = ySpan > 0 ? (point.value - min) / ySpan : 0.5;
      const x = padX + t * (width - padX * 2);
      const y = padY + (1 - yFrac) * (height - padY * 2);
      return `${round(x)},${round(y)}`;
    }).join(' ');
  });
}
