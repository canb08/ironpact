const KEY = 'ironpact.readiness-skips';

export interface ReadinessGate {
  streak: number;
  auto: boolean;
}

function empty(): ReadinessGate {
  return { streak: 0, auto: false };
}

function write(gate: ReadinessGate): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(gate));
}

/** E7.3. Repo has no meta writer, so the skip streak lives with the session screen. */
export function readReadinessGate(): ReadinessGate {
  if (typeof localStorage === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty();
    const row = parsed as { streak?: unknown; auto?: unknown };
    const streak = typeof row.streak === 'number' && Number.isFinite(row.streak) && row.streak > 0
      ? Math.floor(row.streak) : 0;
    return { streak, auto: row.auto === true || streak >= 3 };
  } catch {
    return empty();
  }
}

export function readinessSuppressed(): boolean {
  return readReadinessGate().auto;
}

export function recordReadinessSkip(): ReadinessGate {
  const streak = readReadinessGate().streak + 1;
  const next = { streak, auto: streak >= 3 };
  write(next);
  return next;
}

export function clearReadinessSkips(): void {
  write(empty());
}
