import { motionIsReduced } from '../../ui/motion/reduced';

let burstOverride: (() => Promise<number>) | null = null;
let pending: AbortController | undefined;

/** Tests observe the same lazy boundary without needing a canvas. */
export function setPrBurstForTests(fn: (() => Promise<number>) | null): void { burstOverride = fn; }

/** No canvas or particle chunk is loaded in reduced motion or battery saver. */
export async function firePrConfettiLazy(origins: readonly { x: number; y: number }[] = []): Promise<number> {
  if (motionIsReduced(false) || document.documentElement.dataset.reducedMotion === 'on'
    || document.documentElement.dataset.batterySaver === 'on') return 0;
  if (burstOverride) return burstOverride();
  if (navigator.userAgent.includes('jsdom')) return 0;
  resetPrConfetti();
  const controller = new AbortController();
  pending = controller;
  try {
    const { chalkBurst } = await import('./chalk');
    return chalkBurst(origins, controller.signal);
  } catch { return 0; }
}
export function resetPrConfetti(): void { pending?.abort(); pending = undefined; }
