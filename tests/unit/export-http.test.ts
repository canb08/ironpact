import { describe, expect, it } from 'vitest';
import {
  createExportEtag,
  exportMethodStatus,
  exportResponseStatus,
  isValidExportToken,
  matchesIfNoneMatch,
  parseExportOptions,
  parseExportToken,
  rateLimitDecision,
  resolveExportFormat,
  retryAfterSeconds,
  sha256hex,
} from '../../supabase/functions/_shared/export-http.ts';

const TOKEN = `spx_${'a'.repeat(43)}`;
const OTHER_TOKEN = `spx_${'Z_-09'.repeat(8)}abc`;
const url = (query = ''): URL => new URL(`https://example.test/functions/v1/export${query}`);

describe('export-http: request method', () => {
  it.each(['GET', 'HEAD'])('accepts %s', (method) => {
    expect(exportMethodStatus(method)).toBe(200);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'get', ''])('rejects %s with 405', (method) => {
    expect(exportMethodStatus(method)).toBe(405);
  });
});

describe('export-http: token parsing', () => {
  it('accepts Bearer credentials and case-insensitive auth schemes', () => {
    for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
      expect(parseExportToken(url(), new Headers({ Authorization: `${scheme} ${TOKEN}` })))
        .toEqual({ ok: true, token: TOKEN });
    }
  });

  it('accepts the fallback header, including with a gateway JWT or different auth scheme', () => {
    expect(parseExportToken(url(), new Headers({ 'X-Export-Token': TOKEN }))).toEqual({ ok: true, token: TOKEN });
    expect(parseExportToken(url(), new Headers({ Authorization: 'Basic ignored', 'X-Export-Token': TOKEN })))
      .toEqual({ ok: true, token: TOKEN });
    expect(parseExportToken(url(), new Headers({ Authorization: 'Bearer eyJ.gateway.jwt', 'X-Export-Token': TOKEN })))
      .toEqual({ ok: true, token: TOKEN });
  });

  it('prefers Bearer when both valid headers are present', () => {
    expect(parseExportToken(url(), new Headers({ Authorization: `Bearer ${TOKEN}`, 'X-Export-Token': OTHER_TOKEN })))
      .toEqual({ ok: true, token: TOKEN });
  });

  it.each(['Bearer spx_bad', `Bearer  ${TOKEN}`, `Bearer\t${TOKEN}`, `Bearer ${TOKEN} extra`])(
    'does not silently fall back from malformed Bearer credentials: %s', (authorization) => {
      expect(parseExportToken(url(), new Headers({ Authorization: authorization, 'X-Export-Token': TOKEN })))
        .toEqual({ ok: false, status: 401, body: '' });
    },
  );

  it('rejects missing, malformed and comma-joined credentials with an empty 401', () => {
    for (const headers of [new Headers(), new Headers({ 'X-Export-Token': 'bad' }),
      new Headers({ Authorization: 'Bearer' }), new Headers({ Authorization: 'Bearer bad' }),
      new Headers({ Authorization: 'Bearer eyJ.gateway.jwt' }),
      new Headers({ Authorization: `Bearer ${TOKEN}, Bearer ${OTHER_TOKEN}` }),
      new Headers({ 'X-Export-Token': `${TOKEN}, ${OTHER_TOKEN}` })]) {
      expect(parseExportToken(url(), headers)).toEqual({ ok: false, status: 401, body: '' });
    }
  });

  it.each(['?token=', '?token=bad', '?%74oken=bad', '?token=bad&token='])('rejects a query token before credentials: %s', (query) => {
    expect(parseExportToken(url(query), new Headers({ Authorization: `Bearer ${TOKEN}` })))
      .toEqual({ ok: false, status: 400, body: '' });
    expect(parseExportToken(url(query), new Headers())).toEqual({ ok: false, status: 400, body: '' });
  });

  it('allows unrelated query parameters', () => {
    expect(parseExportToken(url('?since=2026-10-24&format=json'), new Headers({ 'X-Export-Token': TOKEN })))
      .toEqual({ ok: true, token: TOKEN });
  });
});

describe('export-http: strict token shape', () => {
  it.each([TOKEN, OTHER_TOKEN, `spx_${'_'.repeat(43)}`, `spx_${'-'.repeat(43)}`])('accepts exactly 43 base64url characters', (token) => {
    expect(isValidExportToken(token)).toBe(true);
  });

  it.each([
    '', `spx_${'a'.repeat(42)}`, `spx_${'a'.repeat(44)}`, `ipx_${'a'.repeat(43)}`,
    `SPX_${'a'.repeat(43)}`, `spx_${'a'.repeat(42)}+`, `spx_${'a'.repeat(42)}/`,
    `spx_${'a'.repeat(42)}=`, `spx_${'a'.repeat(42)}é`, ` ${TOKEN}`, `${TOKEN} `,
    `${TOKEN}\n`, `${TOKEN}\r\n`, `${TOKEN}\u2028`, `spx_${'a'.repeat(21)} ${'a'.repeat(21)}`,
  ])('rejects invalid token %#', (token) => {
    expect(isValidExportToken(token)).toBe(false);
  });
});

describe('export-http: export options', () => {
  it('leaves absent options to the profile default', () => {
    expect(parseExportOptions(url())).toEqual({ ok: true, since: null, format: null });
  });

  it.each(['2026-10-24', '2024-02-29', '2000-02-29'])('accepts real dates: %s', (since) => {
    expect(parseExportOptions(url(`?since=${since}`))).toEqual({ ok: true, since, format: null });
  });

  it.each(['', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01',
    '2026-10-00', '2026-1-01', '2026-10-24T00:00:00Z', '2026-10-24\n'])('rejects bad since: %s', (since) => {
    expect(parseExportOptions(url(`?since=${encodeURIComponent(since)}`)))
      .toEqual({ ok: false, status: 400, body: 'bad since' });
  });

  it.each(['lines', 'json', 'csv'])('accepts %s overrides', (format) => {
    expect(parseExportOptions(url(`?format=${format}&since=2026-10-24`)))
      .toEqual({ ok: true, since: '2026-10-24', format });
  });

  it.each(['', 'JSON', 'xml', ' json', 'lines\n'])('rejects bad format: %s', (format) => {
    expect(parseExportOptions(url(`?format=${encodeURIComponent(format)}`)))
      .toEqual({ ok: false, status: 400, body: 'bad format' });
  });

  it('uses profile formats and safely defaults missing profiles to lines', () => {
    expect(resolveExportFormat(null, 'json')).toBe('json');
    expect(resolveExportFormat(null, 'csv')).toBe('csv');
    expect(resolveExportFormat(null, 'lines')).toBe('lines');
    for (const missing of [undefined, null, 'xml', 42]) expect(resolveExportFormat(null, missing)).toBe('lines');
    expect(resolveExportFormat('csv', 'json')).toBe('csv');
  });
});

describe('export-http: SHA-256 and ETag', () => {
  it('hashes UTF-8 bytes to stable lowercase SHA-256 hex', async () => {
    expect(await sha256hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256hex('é')).toBe('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
  });

  it('quotes the digest and changes on every representation byte change', async () => {
    expect(await createExportEtag('abc')).toBe('"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"');
    expect(await createExportEtag('abc')).toBe(await createExportEtag('abc'));
    expect(await createExportEtag('abc\n')).not.toBe(await createExportEtag('abc'));
  });

  it.each(['"abc"', 'W/"abc"', '"other", "abc"', ' W/"other",\tW/"abc" ', '*', ' \t*\t ', '"other,tag", "abc"'])(
    'matches conditional validators: %s', (header) => {
    expect(matchesIfNoneMatch(header, '"abc"')).toBe(true);
    expect(exportResponseStatus(header, '"abc"')).toBe(304);
  });

  it.each([null, '', '"other"', '"ABC"', 'abc', 'w/"abc"', '"abc",', ',"abc"',
    '"abc" garbage', 'garbage,"abc"', '*, "abc"', '"abc"\n', '"abc", "unterminated'])(
    'ignores absent, different or malformed validators: %s', (header) => {
    expect(matchesIfNoneMatch(header, '"abc"')).toBe(false);
    expect(exportResponseStatus(header, '"abc"')).toBe(200);
  });

  it('compares opaque tags weakly while preserving case', () => {
    expect(matchesIfNoneMatch('"abc"', 'W/"abc"')).toBe(true);
    expect(matchesIfNoneMatch('W/"ABC"', 'W/"abc"')).toBe(false);
  });
});

describe('export-http: rate-limit decisions', () => {
  const start = Date.parse('2026-10-24T10:00:00Z');

  it.each([1, 59, 60])('permits request %i from the atomic update', (count) => {
    expect(rateLimitDecision(count, start, start)).toEqual({ status: 200 });
  });

  it.each([61, 62, 100])('rejects request %i from the atomic update', (count) => {
    expect(rateLimitDecision(count, start, start + 1)).toEqual({ status: 429, retryAfter: 3600 });
  });

  it.each([
    [0, 3600], [1, 3600], [1000, 3599], [3598999, 2], [3599000, 1],
    [3599999, 1], [3600000, 0], [3600001, 0],
  ])('rounds Retry-After up at %i elapsed ms', (elapsed, expected) => {
    expect(retryAfterSeconds(start, start + elapsed)).toBe(expected);
  });

  it('uses injected time and the returned window start, including a reset window', () => {
    expect(rateLimitDecision(1, start + 3600001, start + 3600001)).toEqual({ status: 200 });
    expect(retryAfterSeconds(start + 3600001, start + 3600001)).toBe(3600);
  });
});
