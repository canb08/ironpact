import { EXPORT_CONTENT_TYPE, formatExport } from '../_shared/export-format.ts';
import { exportMethodStatus, parseExportToken, parseExportOptions, sha256hex, createExportEtag,
  exportResponseStatus, rateLimitDecision, resolveExportFormat } from '../_shared/export-http.ts';
import type { ExportStore } from './store.ts';

export interface ExportDependencies {
  store: () => ExportStore;
  now: () => number;
  wait: (ms: number) => Promise<void>;
}

export function createExportHandler(deps: ExportDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    const respond = (body: string | null, status: number, headers?: HeadersInit): Response =>
      new Response(request.method === 'HEAD' ? null : body, { status, headers });
    const unauthorized = async (): Promise<Response> => {
      await deps.wait(200);
      return respond(null, 401);
    };
    try {
      if (exportMethodStatus(request.method) === 405) return respond(null, 405, { Allow: 'GET, HEAD' });
      const url = new URL(request.url);
      const parsed = parseExportToken(url, request.headers);
      if (!parsed.ok) return parsed.status === 401 ? await unauthorized() : respond(parsed.body, parsed.status);
      const store = deps.store();
      const found = await store.findToken(await sha256hex(parsed.token));
      if (found === null) return await unauthorized();
      const token = await store.consumeToken(found, deps.now);
      if (token === null) return await unauthorized();
      const rate = rateLimitDecision(token.window_count, Date.parse(token.window_start), deps.now());
      if (rate.status === 429) return respond(null, 429, { 'Retry-After': String(rate.retryAfter) });
      const options = parseExportOptions(url);
      if (!options.ok) return respond(options.body, options.status);
      const loaded = await store.loadExport(token.user_id, options.since);
      const format = resolveExportFormat(options.format, loaded.format);
      const body = formatExport(loaded.input, format, options.since);
      const etag = await createExportEtag(body);
      if (!await store.markUsed(token, new Date(deps.now()).toISOString())) return await unauthorized();
      const headers = { 'Content-Type': EXPORT_CONTENT_TYPE[format], 'Cache-Control': 'private, no-cache',
        ETag: etag, 'X-Content-Type-Options': 'nosniff' };
      const status = exportResponseStatus(request.headers.get('If-None-Match'), etag);
      return respond(status === 304 ? null : body, status, headers);
    } catch {
      return respond('export failed', 500);
    }
  };
}
