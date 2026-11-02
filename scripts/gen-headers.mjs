import { readFileSync, writeFileSync } from 'node:fs';

try {
  let origins = '';
  if (process.env.VITE_BACKEND === 'supabase') {
    const url = process.env.VITE_SUPABASE_URL ?? '';
    // Accept a project URL (optionally with its root slash), never credentials,
    // ports, paths, query strings, wildcards, or arbitrary CSP source text.
    if (url !== url.trim() || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
      throw new Error('VITE_SUPABASE_URL must be https://<project-ref>.supabase.co');
    }
    const origin = new URL(url).origin;
    origins = ` ${origin} ${origin.replace('https:', 'wss:')}`;
  }

  const source = readFileSync('public/_headers', 'utf8');
  const headers = source.replaceAll(' https://<ref>.supabase.co wss://<ref>.supabase.co', origins);
  if (headers.includes('<ref>') || headers.includes('*.supabase.co')) {
    throw new Error('Generated headers contain an unresolved project placeholder or Supabase wildcard');
  }
  writeFileSync('dist/_headers', headers);
} catch (error) {
  console.error(`gen-headers: ${error.message}`);
  process.exitCode = 1;
}
