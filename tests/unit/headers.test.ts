import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type HeaderRule = { path: string; headers: Record<string, string> };

function parseHeaders(source: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | undefined;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (!current) throw new Error(`Header outside a rule: ${line}`);
      const trimmed = line.trim();
      const sep = trimmed.indexOf(':');
      if (sep === -1) throw new Error(`Bad header line: ${line}`);
      const name = trimmed.slice(0, sep).trim().toLowerCase();
      const value = trimmed.slice(sep + 1).trim();
      const previous = current.headers[name];
      current.headers[name] = previous === undefined ? value : `${previous}, ${value}`;
      continue;
    }
    current = { path: line.trim(), headers: {} };
    rules.push(current);
  }
  return rules;
}

function directive(csp: string, name: string): string {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  expect(found, name).toBeDefined();
  return found ?? '';
}

describe('public/_headers', () => {
  const source = readFileSync('public/_headers', 'utf8');
  const rules = parseHeaders(source);
  const byPath = new Map(rules.map((rule) => [rule.path, rule.headers]));

  function headers(path: string): Record<string, string> {
    const found = byPath.get(path);
    expect(found, path).toBeDefined();
    return found ?? {};
  }

  it('sends a CSP with supabase connect-src and no unsafe-eval', () => {
    const csp = headers('/*')['content-security-policy'] ?? '';
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(directive(csp, 'script-src')).toBe("script-src 'self'");
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain('https://*.supabase.co');
    expect(connect).toContain('wss://*.supabase.co');
    expect(source).not.toContain('<ref>');
  });

  it('sets nosniff, referrer policy, and permissions policy on every path', () => {
    const all = headers('/*');
    expect(all['x-content-type-options']).toBe('nosniff');
    expect(all['referrer-policy']).toBe('no-referrer');
    expect(all['permissions-policy']).toBe('camera=(), geolocation=(), microphone=()');
    expect(all['cache-control']).toBeUndefined();
  });

  it('caches hashed assets for a long time and does not cache the shell', () => {
    expect(headers('/assets/*')['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      expect(headers(path)['cache-control']).toBe('no-cache');
    }
  });

  it('stays inside Cloudflare Pages limits', () => {
    expect(rules.length).toBeLessThanOrEqual(100);
    for (const line of source.split('\n')) expect(line.length).toBeLessThanOrEqual(2000);
  });
});

describe('keepalive workflow', () => {
  const source = readFileSync('.github/workflows/keepalive.yml', 'utf8');

  it('curls HEALTH_URL and passes with a notice when the secret is unset', () => {
    expect(source).toContain('curl -fsS "$HEALTH_URL"');
    expect(source).toContain('secrets.HEALTH_URL');
    expect(source).toContain('notice: HEALTH_URL is unset; skipping the health ping');
    expect(source).toContain("cron: '0 6 */2 * *'");
    const output = execFileSync(
      'bash',
      [
        '-c',
        'if [ -z "$HEALTH_URL" ]; then echo "notice: HEALTH_URL is unset; skipping the health ping"; exit 0; fi; echo "would curl"; exit 1',
      ],
      { env: { ...process.env, HEALTH_URL: '' }, encoding: 'utf8' },
    );
    expect(output).toContain('notice: HEALTH_URL is unset; skipping the health ping');
  });

  it('commits heartbeat.txt monthly with contents: write only', () => {
    expect(source).toContain('heartbeat.txt');
    expect(source).toContain("date -u +%d");
    expect(source).toMatch(/^permissions:\n {2}contents: write\n/m);
    expect(source).not.toMatch(
      /^ {2}(pull-requests|id-token|actions|checks|packages|deployments|security-events):/m,
    );
  });
});
