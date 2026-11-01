import { isValidSince, type ExportFormat } from './export-format.ts';

const TOKEN_PATTERN = /^spx_[A-Za-z0-9_-]{43}$/;
const HOUR_MS = 60 * 60 * 1000;
const ENTITY_TAG = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/;

export type ExportTokenResult =
  | { ok: true; token: string }
  | { ok: false; status: 400 | 401; body: string };

export type ExportOptionsResult =
  | { ok: true; since: string | null; format: ExportFormat | null }
  | { ok: false; status: 400; body: 'bad since' | 'bad format' };

export function exportMethodStatus(method: string): 200 | 405 {
  return method === 'GET' || method === 'HEAD' ? 200 : 405;
}

export function isValidExportToken(value: string): boolean {
  // The length check also excludes a final LF, which JavaScript's `$` permits.
  return value.length === 47 && TOKEN_PATTERN.test(value);
}

/** Export Bearer credentials take precedence; a gateway JWT can use the fallback. */
export function parseExportToken(url: URL, headers: Pick<Headers, 'get'>): ExportTokenResult {
  if (url.searchParams.has('token')) return { ok: false, status: 400, body: '' };

  const authorization = headers.get('Authorization');
  const hasExportBearer = authorization !== null && /^Bearer\s+spx_/i.test(authorization);
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/i);
  const token = hasExportBearer ? bearer?.[1] : headers.get('X-Export-Token');
  if (typeof token !== 'string' || !isValidExportToken(token)) {
    return { ok: false, status: 401, body: '' };
  }
  return { ok: true, token };
}

function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'lines' || value === 'json' || value === 'csv';
}

/** Called after authentication and the atomic rate-limit update. */
export function parseExportOptions(url: URL): ExportOptionsResult {
  const since = url.searchParams.get('since');
  if (since !== null && (since.length !== 10 || !isValidSince(since))) {
    return { ok: false, status: 400, body: 'bad since' };
  }

  const format = url.searchParams.get('format');
  if (format !== null && !isExportFormat(format)) return { ok: false, status: 400, body: 'bad format' };
  return { ok: true, since, format };
}

export function resolveExportFormat(requested: ExportFormat | null, profileFormat: unknown): ExportFormat {
  return requested ?? (isExportFormat(profileFormat) ? profileFormat : 'lines');
}

/** UTF-8 SHA-256, shared by token lookup and representation validators. */
export async function sha256hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createExportEtag(body: string): Promise<string> {
  return `"${await sha256hex(body)}"`;
}

function trimHttpWhitespace(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, '');
}

/** GET/HEAD If-None-Match uses weak comparison, including lists and wildcard. */
export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  let remaining = trimHttpWhitespace(header);
  if (remaining === '*') return true;
  const expected = etag.replace(/^W\//, '');
  let matched = false;

  while (remaining !== '') {
    const tag = remaining.match(ENTITY_TAG)?.[0];
    if (tag === undefined) return false;
    if (tag.replace(/^W\//, '') === expected) matched = true;
    remaining = trimHttpWhitespace(remaining.slice(tag.length));
    if (remaining === '') return matched;
    if (!remaining.startsWith(',')) return false;
    remaining = trimHttpWhitespace(remaining.slice(1));
    if (remaining === '') return false;
  }
  return false;
}

export function exportResponseStatus(ifNoneMatch: string | null, etag: string): 200 | 304 {
  return matchesIfNoneMatch(ifNoneMatch, etag) ? 304 : 200;
}

/** Inputs are epoch milliseconds; time is supplied by the request handler. */
export function retryAfterSeconds(windowStartMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((windowStartMs + HOUR_MS - nowMs) / 1000));
}

export function rateLimitDecision(
  windowCount: number,
  windowStartMs: number,
  nowMs: number,
): { status: 200 } | { status: 429; retryAfter: number } {
  return windowCount > 60
    ? { status: 429, retryAfter: retryAfterSeconds(windowStartMs, nowMs) }
    : { status: 200 };
}
