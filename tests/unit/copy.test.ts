import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { copy, fill, plural } from '../../src/ui/copy';

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

  it('uses the redesign wording while preserving template keys', () => {
    expect(copy.setLogged).toBe('Saved');
    expect(copy.firstSession).toBe('First sessions set your baseline. PRs start after 2.');
    expect(copy.finish).toBe('Finish workout (hold)');
    expect(copy.floor).toBe('Today');
    expect(copy.martialArts).toBe('Fight');
    expect(copy.x5Estimate).toBe('Estimated 1-rep max (e1RM)');
    expect(copy.x10Today).toBe('Today');
    expect(copy.x10Train).toBe('Train');
  });

  it('has no all-caps words except the brand, units and established acronyms', () => {
    // MIN and PR badges are required by REDESIGN; export instructions are a machine format.
    const allowed = new Set(['SPOTTER', 'MIN', 'PR', 'PRs', 'RPE', 'UI', 'JSON', 'CSV', 'URL', 'AI', 'BW', 'DOTS', 'DELETE']);
    for (const [key, value] of Object.entries(copy)) {
      if (key === 'copyForAiTemplate') continue;
      const words = value.replace(/\{[^}]+\}/g, '').match(/\b[A-Z][A-Z0-9]+s?\b/g) ?? [];
      for (const word of words) expect(allowed.has(word), `${key}: ${word}`).toBe(true);
    }
  });

  it('keeps machine-readable export syntax intact', () => {
    expect(copy.copyForAiTemplate).toContain('?since=YYYY-MM-DD');
    expect(copy.copyForAiTemplate).toContain('If-None-Match: <last ETag>');
    expect(copy.copyForAiTemplate).toContain('Never append.');
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


describe('count labels', () => {
  it.each([0, 1, 2, 12])('pluralises sets, sessions and days for %i', (count) => {
    expect(fill(copy.sessionSetCount, { count })).toBe(`${count} ${count === 1 ? 'set' : 'sets'}`);
    expect(fill(copy.x4SetCount, { count })).toBe(`${count} ${count === 1 ? 'set' : 'sets'}`);
    expect(fill(copy.togetherSessions, { count })).toBe(`${count} ${count === 1 ? 'session' : 'sessions'}`);
    expect(fill(copy.lastTrained, { days: count })).toBe(`Last trained ${count} ${count === 1 ? 'day' : 'days'} ago`);
  });
  it('handles irregular nouns without changing unrelated template values', () => {
    expect(plural(1, 'entry', 'entries')).toBe('entry');
    expect(plural(0, 'entry', 'entries')).toBe('entries');
    expect(fill('{count} {note}', { count: 1, note: 'sets' })).toBe('1 sets');
  });
});
