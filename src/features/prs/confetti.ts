import { PR_SEQUENCE_MS } from './sequence.ts';

/** Chalk dust plus molten sparks. Spec §3.9.4 caps the burst at 120. */
export const PR_CHALK_COUNT = 112;
export const PR_SPARK_COUNT = 8;
export const PR_CONFETTI_TOTAL = PR_CHALK_COUNT + PR_SPARK_COUNT;

const CHALK = '#F2F0EB';
const MOLTEN = '#FF4D00';
/** Irregular chalk flake. `shapeFromPath` throws where Path2D is missing; circles are the fallback. */
const CHALK_PATH = 'M1 4 L5 0 L11 3 L9 11 L3 9 Z';

interface BurstOptions {
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  gravity?: number;
  ticks?: number;
  origin?: { x?: number; y?: number };
  colors?: string[];
  shapes?: ReadonlyArray<string | BurstShape>;
  scalar?: number;
  zIndex?: number;
  disableForReducedMotion?: boolean;
}

interface BurstShape {
  readonly type?: string;
}

interface ConfettiFn {
  (options?: BurstOptions): Promise<undefined> | null;
  shapeFromPath(path: { path: string; matrix?: number[] } | string): BurstShape;
  reset(): void;
}

let loaded: ConfettiFn | null = null;
let burstOverride: (() => Promise<number>) | null = null;

/** Test seam. Production never sets this. Pass null to restore the real burst. */
export function setPrBurstForTests(fn: (() => Promise<number>) | null): void {
  burstOverride = fn;
}

export function canvasCanPaint(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return false;
  try {
    return document.createElement('canvas').getContext('2d') != null;
  } catch {
    return false;
  }
}

async function loadConfetti(): Promise<ConfettiFn> {
  if (loaded) return loaded;
  const mod: { default?: ConfettiFn } = await import('canvas-confetti');
  const fn = mod.default;
  if (typeof fn !== 'function') throw new Error('canvas-confetti did not load');
  loaded = fn;
  return fn;
}

export function chalkShape(confetti: ConfettiFn): BurstShape | 'circle' {
  if (typeof Path2D !== 'function' || typeof confetti.shapeFromPath !== 'function') return 'circle';
  try {
    return confetti.shapeFromPath({ path: CHALK_PATH });
  } catch {
    return 'circle';
  }
}

export function prBurstOptions(shape: BurstShape | 'circle'): { chalk: BurstOptions; sparks: BurstOptions } {
  if (PR_CONFETTI_TOTAL > 120) throw new Error('PR confetti exceeds 120 particles');
  const shared = {
    gravity: 0.4,
    ticks: PR_SEQUENCE_MS.final - PR_SEQUENCE_MS.burst,
    origin: { y: 0.42 },
    disableForReducedMotion: true,
    zIndex: 75,
  } satisfies BurstOptions;
  return {
    chalk: {
      ...shared,
      particleCount: PR_CHALK_COUNT,
      colors: [CHALK],
      shapes: [shape],
      scalar: 0.9,
      spread: 80,
      startVelocity: 22,
    },
    sparks: {
      ...shared,
      particleCount: PR_SPARK_COUNT,
      colors: [MOLTEN],
      shapes: ['circle'],
      scalar: 0.55,
      spread: 46,
      startVelocity: 16,
    },
  };
}

/** Fires the two bursts. `fire` is injectable so tests never need a canvas. */
export async function firePrConfetti(fire: ConfettiFn, shape: BurstShape | 'circle' = 'circle'): Promise<number> {
  const { chalk, sparks } = prBurstOptions(shape);
  await fire(chalk);
  await fire(sparks);
  return PR_CONFETTI_TOTAL;
}

/** Lazy import. No canvas when the burst is overridden, reduced, or the surface cannot paint. */
export async function firePrConfettiLazy(): Promise<number> {
  if (burstOverride) return burstOverride();
  if (!canvasCanPaint()) return 0;
  try {
    const confetti = await loadConfetti();
    return await firePrConfetti(confetti, chalkShape(confetti));
  } catch {
    return 0;
  }
}

export function resetPrConfetti(): void {
  try {
    loaded?.reset();
  } catch {
    /* The canvas may already have been removed. */
  }
}
