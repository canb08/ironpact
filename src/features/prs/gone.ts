const goneIds = new Set<string>();
const goneListeners = new Set<() => void>();
const armOwner = new Map<string, number>();
let armSerial = 0;

function emit(): void {
  for (const listener of goneListeners) listener();
}

export function subscribePrGone(listener: () => void): () => void {
  goneListeners.add(listener);
  return () => {
    goneListeners.delete(listener);
  };
}

export function prMomentGone(id: string): boolean {
  return goneIds.has(id);
}

/** Claim the moment id. A newer claim wins; the previous release becomes a no-op. */
export function claimPrMoment(id: string): number {
  const serial = ++armSerial;
  armOwner.set(id, serial);
  goneIds.delete(id);
  emit();
  return serial;
}

export function releasePrMoment(id: string, serial: number): void {
  if (armOwner.get(id) !== serial) return;
  goneIds.add(id);
  emit();
}
