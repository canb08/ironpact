import { readFileSync } from 'node:fs';
import { formatHex, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/ui/tokens.css', 'utf8');
function tokens(selector: string): Record<string, string> {
  const block = source.split(`${selector} {`)[1]?.split('}')[0] ?? '';
  return Object.fromEntries(
    Array.from(block.matchAll(/--([\w-]+): (oklch\([^;]+\));/g), (match) => [match[1], match[2]]),
  );
}
const dark = tokens(':root');
const light = { ...dark, ...tokens("[data-theme='light']") };
function colour(theme: Record<string, string>, key: string): string {
  const value = theme[key];
  if (!value) throw new Error(`Missing colour token: ${key}`);
  return value;
}

it('preserves the R2 palette in both themes', () => {
  const palette = {
    rubber: '#1e1f22', 'rubber-raised': '#2a2c30', chalk: '#edebe6', steel: '#8c9199',
    'plate-red': '#d3263a', 'plate-blue': '#2563c9', 'plate-yellow': '#f2c230', 'plate-green': '#2f9e5b',
  };
  for (const theme of [dark, light]) {
    for (const [key, hex] of Object.entries(palette)) expect(formatHex(colour(theme, key))).toBe(hex);
  }
  expect(formatHex(colour(dark, 'bg'))).toBe(palette.rubber);
  expect(formatHex(colour(light, 'text'))).toBe(palette.rubber);
  expect(formatHex(colour(light, 'bg'))).toBe(palette.chalk);
  expect(formatHex(colour(dark, 'text'))).toBe(palette.chalk);
});

// Fixed plate colours are decorative fills. Text uses AA ink or a contrasting label.
// https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Color_contrast
for (const [name, theme] of Object.entries({ dark, light })) {
  describe(`${name} R2 contrast`, () => {
    const pairs: [string, string, number][] = [];
    for (const ink of ['text', 'text-muted', 'text-faint', 'molten', 'danger', 'partner-text', 'success-text']) {
      for (const background of ['bg', 'surface-1', 'surface-2', 'surface-3']) pairs.push([ink, background, 4.5]);
    }
    pairs.push(
      ['on-primary', 'plate-red', 4.5], ['rubber', 'plate-yellow', 4.5],
      ['on-molten', 'molten', 4.5], ['bg', 'text', 4.5],
      ['line', 'bg', 3], ['line', 'surface-2', 3],
    );
    for (const [ink, background, minimum] of pairs) {
      it(`${ink} on ${background} meets ${minimum}:1`, () => {
        expect(wcagContrast(colour(theme, ink), colour(theme, background))).toBeGreaterThanOrEqual(minimum);
      });
    }
  });
}
