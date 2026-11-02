export interface DeleteAccountStore {
  authenticate(token: string): Promise<string | null>;
  deleteUser(id: string): Promise<void>;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

export function createDeleteAccountHandler(store: () => DeleteAccountStore) {
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, body: string) => new Response(body, { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'Method not allowed');
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!token) return reply(401, 'Unauthorized');
    try {
      const backend = store();
      // Auth validates the session. Never trust a decoded JWT or a body-supplied ID.
      const id = await backend.authenticate(token);
      if (!id) return reply(401, 'Unauthorized');
      await backend.deleteUser(id);
      return new Response(JSON.stringify({ deleted: true }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch {
      // Never expose backend responses or credentials.
      return reply(503, 'Account deletion unavailable');
    }
  };
}
