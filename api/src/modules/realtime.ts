// Canal de eventos em tempo real (SSE). O app abre GET /api/events e recebe:
//   notification · message · typing · read
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { requireUser, type Ctx } from '../lib/context.js';
import { subscribe } from '../lib/events.js';

export default function realtimeRoutes(app: FastifyInstance, _ctx: Ctx) {
  app.get('/events', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = requireUser(req);
    reply.hijack();
    const res = reply.raw;
    const allowed = [...config.APP_URL.split(',').map((x) => x.trim()), 'capacitor://localhost', 'http://localhost', 'https://localhost'];
    const origin = req.headers.origin && allowed.includes(req.headers.origin) ? req.headers.origin : undefined;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write('retry: 4000\n\n');
    send('ready', { userId: u.id });
    const off = subscribe(u.id, send);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000); // mantém a conexão aberta em proxies
    req.raw.on('close', () => { clearInterval(ping); off(); });
  });
}
