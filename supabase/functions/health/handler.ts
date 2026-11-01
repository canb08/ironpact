/** L4: a gateway response alone is not database activity. Fail closed. */
export function createHealthHandler(readDatabase: () => Promise<void>) {
  return async (): Promise<Response> => {
    try {
      await readDatabase();
      return new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch {
      return new Response('unavailable', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  };
}
