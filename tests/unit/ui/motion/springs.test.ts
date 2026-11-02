import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EASE_OUT, HEAVY, SLAM, SPRING_EASE, SPRING_MS, UI } from '../../../../src/ui/motion/springs';

describe('spring easings', () => {
  it('keeps the spec springs and matches springs.css', () => {
    expect(UI).toEqual({ type: 'spring', stiffness: 400, damping: 30 });
    expect(SLAM).toEqual({ type: 'spring', stiffness: 600, damping: 18 });
    expect(HEAVY).toEqual({ type: 'spring', stiffness: 220, damping: 26, mass: 1.4 });
    expect([...EASE_OUT]).toEqual([0.2, 0.8, 0.2, 1]);
    const css = readFileSync(new URL('../../../../src/ui/motion/springs.css', import.meta.url), 'utf8');
    expect(css).toContain(SPRING_EASE.ui);
    expect(css).toContain(SPRING_EASE.slam);
    expect(css).toContain(SPRING_EASE.heavy);
    expect(css).toContain(SPRING_EASE.fallback);
    expect(css).toContain(`${SPRING_MS.ui}ms`);
    expect(css).toContain(`${SPRING_MS.slam}ms`);
    expect(css).toContain(`${SPRING_MS.heavy}ms`);
  });
});
