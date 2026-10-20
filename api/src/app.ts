import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { and, eq, gt } from 'drizzle-orm';
import { config, isProd } from './config.js';
import type { Database } from './db/index.js';
import { sessions, users } from './db/schema.js';
import { ApiError } from './lib/errors.js';
import { sha256 } from './lib/security.js';
import type { Ctx } from './lib/context.js';
import { installNoticeEmails } from './lib/noticeEmails.js';
import { paymentProvider, type PaymentProvider } from './providers/payments.js';
import { createMailer, createSms } from './providers/messaging.js';
import { localStorage } from './providers/storage.js';
import { jwtOAuthVerifier, type OAuthVerifier } from './providers/oauth.js';
import authRoutes, { SESSION_COOKIE } from './modules/auth.js';
import meRoutes from './modules/me.js';
import partnerRoutes from './modules/partners.js';
import bookingRoutes from './modules/bookings.js';
import paymentRoutes from './modules/payments.js';
import chatRoutes from './modules/chat.js';
import safetyRoutes from './modules/safety.js';
import notificationRoutes from './modules/notifications.js';
import verificationRoutes from './modules/verification.js';
import adminRoutes from './modules/admin.js';
import adminFinanceRoutes from './modules/adminFinance.js';
import supportRoutes from './modules/support.js';
import realtimeRoutes from './modules/realtime.js';
import growthRoutes from './modules/growth.js';

export async function buildApp(database: Database, opts: { payments?: PaymentProvider; logger?: boolean; oauth?: OAuthVerifier } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? (config.NODE_ENV !== 'test'),
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const ctx: Ctx = {
    db: database.db,
    payments: opts.payments ?? paymentProvider(),
    mailer: createMailer(app.log),
    sms: createSms(app.log),
    storage: localStorage,
    oauth: opts.oauth ?? jwtOAuthVerifier,
  };

  installNoticeEmails(ctx); // avisos das notificações também por e-mail

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  const origins = config.APP_URL.split(',').map((s) => s.trim());
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin) || ['capacitor://localhost', 'http://localhost', 'https://localhost'].includes(origin)),
    credentials: true,
  });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', global: true, allowList: () => config.NODE_ENV === 'test' });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 3 } });
  mkdirSync(config.UPLOAD_DIR, { recursive: true });
  await app.register(fstatic, { root: path.resolve(config.UPLOAD_DIR), prefix: '/uploads/', decorateReply: false });

  // Sessão: cookie httpOnly (site) ou "Authorization: Bearer" (app nativo)
  app.addHook('preHandler', async (req) => {
    const header = req.headers.authorization;
    // EventSource (tempo real) não envia cabeçalhos: no app nativo, o token vem em ?token=
    const qToken = req.url.startsWith('/api/events') ? (req.query as { token?: string } | undefined)?.token : undefined;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : qToken || req.cookies[SESSION_COOKIE];
    if (!raw) return;
    const [row] = await ctx.db.select({ s: sessions, u: users }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(raw)), gt(sessions.expiresAt, new Date())));
    if (!row || row.u.status !== 'active') return;
    req.user = row.u;
    req.sessionId = row.s.id;
    if (Date.now() - row.u.lastSeenAt.getTime() > 60_000) {
      await ctx.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.u.id));
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: { code: 'too_many_requests', message: 'Muitas tentativas. Aguarde um pouco.' } });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: { code: e.code ?? 'bad_request', message: e.message } });
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: isProd ? 'Erro interno.' : e.message } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Rota não encontrada.' } }));

  app.get('/api/health', async () => ({ ok: true, service: 'rolejunto-api', time: new Date().toISOString() }));

  await app.register(async (api) => {
    authRoutes(api, ctx);
    meRoutes(api, ctx);
    partnerRoutes(api, ctx);
    bookingRoutes(api, ctx);
    paymentRoutes(api, ctx);
    chatRoutes(api, ctx);
    safetyRoutes(api, ctx);
    notificationRoutes(api, ctx);
    verificationRoutes(api, ctx);
    adminRoutes(api, ctx);
    adminFinanceRoutes(api, ctx);
    supportRoutes(api, ctx);
    realtimeRoutes(api, ctx);
    growthRoutes(api, ctx);
  }, { prefix: '/api' });

  return app;
}
