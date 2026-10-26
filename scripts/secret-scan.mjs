import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Character classes keep the scanner's own tracked source free of matching literals.
const patterns = [
  /\b[si]px_[A-Za-z0-9_-]{43}\b/,
  /sb_sec[r]et_/,
  /service_role"?\s*[:=]/,
  /eyJhbGc[i][A-Za-z0-9_-]{20,}/,
];

function filesUnder(path) {
  const stat = lstatSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path).flatMap((entry) => filesUnder(join(path, entry)));
}

function scan(paths) {
  for (const file of new Set(paths)) {
    const name = relative(process.cwd(), file).split('\\').join('/');
    if (name === 'docs/SPEC.md' || name.startsWith('docs/tickets/')) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (patterns.some((pattern) => pattern.test(line))) {
        console.error(`${name}:${index + 1}`);
        process.exitCode = 1;
      }
    }
  }
}

if (!import.meta.vitest) {
  try {
    const args = process.argv.slice(2);
    const paths = args.length
      ? args.flatMap((path) => filesUnder(resolve(path)))
      : [
          ...execFileSync('git', ['ls-files', '-z'], { maxBuffer: 16 * 1024 * 1024 })
            .toString('utf8').split('\0').filter(Boolean).flatMap(filesUnder),
          ...filesUnder('dist'),
        ];
    scan(paths);
  } catch {
    console.error('Secret scan could not complete.');
    process.exitCode = 1;
  }
}

// In-source Vitest tests keep A1 inside its explicit file allowlist.
if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  const script = fileURLToPath(import.meta.url);
  const run = (cwd, args = []) => spawnSync(process.execPath, [script, ...args], {
    cwd, encoding: 'utf8',
  });
  function inTemp(check) {
    const dir = mkdtempSync(join(tmpdir(), 'ironpact-scan-'));
    try { check(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  }

  test('rejects a planted secret, reports only file:line, and accepts a clean file', () => {
    inTemp((dir) => {
      const secret = ['sb_', 'secret_test'].join('');
      writeFileSync(join(dir, 'fixture.txt'), `clean\n${secret}\n`);
      const rejected = run(dir, ['fixture.txt']);
      expect(rejected.status).toBe(1);
      expect(rejected.stdout).toBe('');
      expect(rejected.stderr.trim()).toBe('fixture.txt:2');
      expect(rejected.stderr).not.toContain(secret);
      writeFileSync(join(dir, 'fixture.txt'), 'SPOTTER\n');
      const clean = run(dir, ['fixture.txt']);
      expect(clean.status).toBe(0);
      expect(clean.stderr).toBe('');
    });
  });

  test('detects every required signature without leaking it', () => {
    inTemp((dir) => {
      const samples = [
        `spx_${'a'.repeat(43)}`, `ipx_${'B'.repeat(43)}`,
        ['service_', 'role:'].join(''), ['service_', 'role" ='].join(''),
        `eyJhbGc${'i'}${'a'.repeat(20)}`,
      ];
      for (const sample of samples) {
        writeFileSync(join(dir, 'fixture.txt'), sample);
        const result = run(dir, ['fixture.txt']);
        expect(result.status).toBe(1);
        expect(result.stderr.trim()).toBe('fixture.txt:1');
      }
      writeFileSync(join(dir, 'fixture.txt'), `spx_placeholder\nspx_${'a'.repeat(42)}\n`);
      expect(run(dir, ['fixture.txt']).status).toBe(0);
    });
  });

  test('scans tracked files and nested dist files, excluding only the specified docs', () => {
    inTemp((dir) => {
      execFileSync('git', ['init', '--quiet'], { cwd: dir });
      mkdirSync(join(dir, 'docs/tickets'), { recursive: true });
      mkdirSync(join(dir, 'dist/assets'), { recursive: true });
      const secret = ['sb_', 'secret_test'].join('');
      writeFileSync(join(dir, 'docs/SPEC.md'), secret);
      writeFileSync(join(dir, 'docs/tickets/A1.md'), secret);
      writeFileSync(join(dir, 'tracked.txt'), 'clean');
      execFileSync('git', ['add', 'docs', 'tracked.txt'], { cwd: dir });
      expect(run(dir).status).toBe(0);
      writeFileSync(join(dir, 'tracked.txt'), secret);
      expect(run(dir).stderr.trim()).toBe('tracked.txt:1');
      writeFileSync(join(dir, 'tracked.txt'), 'clean');
      writeFileSync(join(dir, 'dist/assets/chunk.js'), secret);
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe('dist/assets/chunk.js:1');
    });
  });

  test('fails closed when an input or the build directory is missing', () => {
    inTemp((dir) => {
      expect(run(dir, ['missing.txt']).status).toBe(1);
      execFileSync('git', ['init', '--quiet'], { cwd: dir });
      expect(run(dir).status).toBe(1);
    });
  });
}
