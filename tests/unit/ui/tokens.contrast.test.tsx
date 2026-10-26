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

it('preserves the hex source values through the OKLCH conversion', () => {
  for (const match of source.matchAll(/--[\w-]+: (oklch\([^;]+\)); \/\* (#[\da-f]{6}) \*\//gi)) {
    expect(formatHex(match[1])).toBe(match[2]?.toLowerCase());
  }
  expect(formatHex(colour(dark, 'tier-titanium'))).toBe('#c9ccd1');
});

// These five source-value conflicts require a SPEC decision, not silent token edits.
// MDN confirms the thresholds: https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Color_contrast
const conflicts = new Set([
  'dark: tier-obsidian on surface-1',
  'light: molten on surface-2',
  'light: tier-iron on surface-1',
  'light: tier-steel on surface-1',
  'light: tier-titanium on surface-1',
]);

for (const [name, theme] of Object.entries({ dark, light })) {
  describe(`${name} contrast (§3.2.4)`, () => {
    const pairs: [string, string, number][] = [];
    for (const ink of ['text', 'text-muted', 'molten']) {
      for (const background of ['bg', 'surface-1', 'surface-2']) pairs.push([ink, background, 4.5]);
    }
    pairs.push(['on-molten', 'molten', 4.5], ['danger', 'surface-1', 4.5]);
    for (const ink of [
      'member-volt',
      'member-ice',
      'rest',
      'tier-iron',
      'tier-steel',
      'tier-titanium',
      'tier-obsidian',
    ])
      pairs.push([ink, 'surface-1', 3]);

    for (const [ink, background, minimum] of pairs) {
      const label = `${name}: ${ink} on ${background}`;
      if (conflicts.has(label)) {
        it.fails(`${label} — known SPEC contrast conflict, awaiting contract change`, () => {
          expect(
            wcagContrast(colour(theme, ink), colour(theme, background)),
          ).toBeGreaterThanOrEqual(minimum);
        });
      } else {
        it(`${ink} on ${background} meets ${minimum}:1`, () => {
          expect(
            wcagContrast(colour(theme, ink), colour(theme, background)),
          ).toBeGreaterThanOrEqual(minimum);
        });
      }
    }
  });
}
