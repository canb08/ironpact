/** Hand-rolled, finite canvas burst. This entire module is a lazy chunk. */
export const CHALK_COUNT = 96;
export function chalkBurst(origins: readonly { x: number; y: number }[], signal?: AbortSignal): number {
  if (signal?.aborted || document.documentElement.dataset.batterySaver === 'on'
    || document.documentElement.dataset.reducedMotion === 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.prChalk = '';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '75' });
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  context.scale(ratio, ratio);
  document.body.append(canvas);
  const points = origins.length ? origins : [{ x: innerWidth * 0.25, y: innerHeight * 0.4 }, { x: innerWidth * 0.75, y: innerHeight * 0.4 }];
  const particles = Array.from({ length: CHALK_COUNT }, (_, index) => {
    const origin = points[index % points.length]!;
    return { x: origin.x, y: origin.y, vx: (Math.random() - 0.5) * 180, vy: -30 - Math.random() * 110, size: 1 + Math.random() * 2 };
  });
  let frame = 0;
  const start = performance.now();
  const stop = () => { cancelAnimationFrame(frame); canvas.remove(); signal?.removeEventListener('abort', stop); };
  signal?.addEventListener('abort', stop, { once: true });
  const paint = (now: number) => {
    const elapsed = (now - start) / 1000;
    if (elapsed >= 0.9 || document.documentElement.dataset.batterySaver === 'on'
      || document.documentElement.dataset.reducedMotion === 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches) { stop(); return; }
    context.clearRect(0, 0, innerWidth, innerHeight);
    context.fillStyle = '#EDEBE6';
    context.globalAlpha = (1 - elapsed / 0.9) * 0.65;
    for (const particle of particles) context.fillRect(particle.x + particle.vx * elapsed, particle.y + particle.vy * elapsed + 90 * elapsed * elapsed, particle.size, particle.size);
    frame = requestAnimationFrame(paint);
  };
  frame = requestAnimationFrame(paint);
  return CHALK_COUNT;
}
