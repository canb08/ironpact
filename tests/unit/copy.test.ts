import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { copy, fill } from '../../src/ui/copy';

const banned = [
  'beast',
  'no excuses',
  'grind',
  'crush it',
  'failed',
  'missed',
  'lazy',
  'you broke your streak',
  "don't give up",
];
const paths = ['src/ui/copy.ts', 'supabase/functions/_shared/push-copy.ts'].filter(existsSync);

describe('copy guardrails', () => {
  it.each(paths)('%s contains no banned copy or email address', (path) => {
    const source = readFileSync(path, 'utf8');
    for (const phrase of banned) expect(source.toLowerCase()).not.toContain(phrase);
    expect(source).not.toMatch(/@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?/i);
  });

  it('uses neutral pronouns in user-facing strings (E2.6)', () => {
    for (const value of Object.values(copy)) expect(value).not.toMatch(/\b(him|his|he|she|her)\b/i);
  });

  it('contains the entire verbatim string bank, with the E2.6 override for #23', () => {
    const spec = readFileSync('docs/SPEC.md', 'utf8');
    const bank = spec
      .split('#### 3.10.1 String bank (use exactly)')[1]
      ?.split('**Notes on specific strings:**')[0];
    expect(bank).toBeDefined();
    const values: readonly string[] = Object.values(copy);
    const strings = Array.from((bank ?? '').matchAll(/"([^"]+)"/g), (match) => match[1]);
    expect(strings.length).toBe(65);
    for (const value of strings) {
      if (value === "{partner}'s week is light. You can spot him.") {
        expect(values).toContain("{partner}'s week is light. You can cover it.");
      } else {
        expect(values).toContain(value);
      }
    }
    expect(values).toContain('Code delayed — try again in 60 s.');
    expect(values).not.toContain('Link delayed — try again in 60 s');
    expect(values).toContain("Saved on your phone. Syncs when you're back up.");
    expect(values).toContain("Code's dead. Ask for a new one.");
  });
});

describe('fill', () => {
  it('replaces every occurrence with literal values, including {me}/{partner}', () => {
    expect(fill('{me} + {partner} + {me}', { me: '$&', partner: 'Training partner' })).toBe(
      '$& + Training partner + $&',
    );
    expect(fill(copy.tierUp, { Tier: 'Steel' })).toBe('Steel now. Heavier than last month.');
    expect(fill('Set {count}', { count: 0 })).toBe('Set 0');
    expect(fill('Plain', {})).toBe('Plain');
  });

  it('throws on absent variables and inherited properties', () => {
    // @ts-expect-error Missing variables are also rejected at compile time.
    expect(() => fill('{me} {partner}', { me: 'You' })).toThrow(
      'Missing template variable: partner',
    );
    expect(() => fill('{toString}', {} as Record<'toString', string>)).toThrow(
      'Missing template variable: toString',
    );
  });
});
