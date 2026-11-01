/* global Deno */
Deno.serve(() => new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
