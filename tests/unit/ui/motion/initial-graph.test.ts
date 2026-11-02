import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BANNED = [/^motion($|\/)/, /^@number-flow\//, /^canvas-confetti($|\/)/, /^framer-motion($|\/)/];

function specifiers(source: string): { kind: 'static' | 'dynamic'; spec: string }[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found: { kind: 'static' | 'dynamic'; spec: string }[] = [];
  for (const match of text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = match[1];
    if (spec) found.push({ kind: 'dynamic', spec });
  }
  const withoutDynamic = text.replace(/import\s*\(\s*['"][^'"]+['"]\s*\)/g, '');
  for (const match of withoutDynamic.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec) found.push({ kind: 'static', spec });
  }
  return found;
}

function resolveFile(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.tsx')];
  if (existsSync(base) && statSync(base).isFile()) candidates.unshift(base);
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function isBanned(spec: string): boolean {
  return BANNED.some((pattern) => pattern.test(spec));
}

describe('initial JS graph', () => {
  it('keeps motion, number-flow and canvas-confetti out of the entry graph', () => {
    const root = resolve('src/main.tsx');
    const seen = new Set<string>();
    const bannedHits: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const { kind, spec } of specifiers(source)) {
        if (kind === 'dynamic') continue;
        if (isBanned(spec)) bannedHits.push(`${file} → ${spec}`);
        const next = resolveFile(file, spec);
        if (next) walk(next);
      }
    };
    walk(root);
    expect(bannedHits).toEqual([]);
    expect(seen.has(resolve('src/features/session/SessionScreen.tsx'))).toBe(false);
  });
});
