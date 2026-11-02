import { readFileSync } from 'node:fs';
import { formatHex, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync('src/ui/tokens.css', 'utf8');
const takeover = readFileSync('src/features/prs/takeover.css', 'utf8');

function rule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = source.slice(start, source.indexOf('}', start));
  return body;
}

function oklch(css: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(oklch\\([^;]+\\))`).exec(css);
  const value = match?.[1];
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

/** D9: rgba(10, 10, 11, 0.92) over the page background. */
function scrim(page: string): string {
  const hex = formatHex(page);
  if (!hex) throw new Error(`unreadable ${page}`);
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const mixed = channels.map((channel, index) => Math.round(0.92 * [10, 10, 11][index]! + 0.08 * channel));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

describe('PR takeover e1RM contrast', () => {
  const ink = oklch(rule(takeover, '.pr-takeover'), 'pr-takeover-muted');
  const dark = scrim(oklch(rule(tokens, ':root'), 'bg'));
  const light = scrim(oklch(rule(tokens, "[data-theme='light']"), 'bg'));

  it('uses a scrim token, not theme --text-muted', () => {
    expect(takeover).toMatch(/\.pr-takeover__e1rm \{\s*color: var\(--pr-takeover-muted\)/);
    expect(takeover).not.toMatch(/\.pr-takeover__e1rm \{\s*color: var\(--text-muted\)/);
  });

  it('meets 4.5:1 on the takeover scrim in both themes', () => {
    expect(wcagContrast(ink, dark)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(ink, light)).toBeGreaterThanOrEqual(4.5);
  });
});
