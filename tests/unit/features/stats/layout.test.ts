import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps Progress inside 375 px at 200% text: wrap, no fixed page width, no horizontal scroll', () => {
  const css = readFileSync('src/features/stats/progress.css', 'utf8');
  expect(css).toContain('flex-wrap: wrap');
  expect(css).toContain('overflow-wrap: anywhere');
  expect(css).toContain('min-width: 0');
  expect(css).toContain('max-width: 100%');
  expect(css).toContain('.progress-sr');
  expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  expect(css).not.toMatch(/width:\s*\d{3,}px/);
  expect(css).not.toMatch(/min-width:\s*\d{3,}px/);
});
