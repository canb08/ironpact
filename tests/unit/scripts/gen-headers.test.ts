import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/gen-headers.mjs');
const template = readFileSync('public/_headers', 'utf8');
const placeholders = ' https://<ref>.supabase.co wss://<ref>.supabase.co';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function generate(backend = '', url = '', source = template) {
  const cwd = mkdtempSync(join(tmpdir(), 'h5-headers-'));
  directories.push(cwd);
  mkdirSync(join(cwd, 'public'));
  mkdirSync(join(cwd, 'dist'));
  writeFileSync(join(cwd, 'public/_headers'), source);
  // Vite has already copied the template before the generator runs.
  writeFileSync(join(cwd, 'dist/_headers'), source);
  const result = spawnSync(process.execPath, [script], {
    cwd,
    env: { ...process.env, VITE_BACKEND: backend, VITE_SUPABASE_URL: url },
    encoding: 'utf8',
  });
  return { ...result, headers: readFileSync(join(cwd, 'dist/_headers'), 'utf8') };
}

describe('build header generation', () => {
  it.each(['', 'mock', 'ci'])('limits backend %j to self and preserves other headers', (backend) => {
    const result = generate(backend, 'https://abcd.supabase.co');
    expect(result.status).toBe(0);
    expect(result.headers).toBe(template.replace(placeholders, ''));
    expect(result.headers).toContain("connect-src 'self';");
    expect(result.headers).not.toMatch(/<ref>|\*\.supabase\.co/);
  });

  it.each(['https://abcd.supabase.co', 'https://abcd.supabase.co/'])(
    'uses only the project HTTPS and WSS origins for %s',
    (url) => {
      const result = generate('supabase', url);
      expect(result.status).toBe(0);
      expect(result.headers).toBe(template.replace(placeholders, ' https://abcd.supabase.co wss://abcd.supabase.co'));
      expect(result.headers).not.toMatch(/<ref>|\*\.supabase\.co/);
    },
  );

  it.each([
    '', 'not-a-url', 'http://abcd.supabase.co', 'https://*.supabase.co',
    'https://<ref>.supabase.co', 'https://supabase.co', 'https://abcd.supabase.co.evil.test',
    'https://abcd.supabase.co:443', 'https://alice:password@abcd.supabase.co',
    'https://abcd.supabase.co/rest/v1', 'https://abcd.supabase.co?key=private',
    'https://abcd.supabase.co#fragment', 'https://abcd.supabase.co\n',
    "https://abcd.supabase.co; script-src 'unsafe-inline'",
  ])('rejects a missing or malformed Supabase URL (%j) without echoing it', (url) => {
    const result = generate('supabase', url);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('gen-headers: VITE_SUPABASE_URL must be https://<project-ref>.supabase.co\n');
  });

  it.each(['<ref>', 'https://*.supabase.co', 'wss://*.supabase.co'])(
    'fails if %s survives anywhere in the generated headers',
    (leftover) => {
      const result = generate('supabase', 'https://abcd.supabase.co', `${template}\n# ${leftover}\n`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unresolved project placeholder or Supabase wildcard');
    },
  );
});
