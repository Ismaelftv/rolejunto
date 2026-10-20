import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config, isProd } from '../config.js';
import { emailCodes, partnerProfiles, passwordResets, sessions, users } from '../db/schema.js';
import { audit, parse, requireUser, type Ctx, type UserRow } from '../lib/context.js';
import { renderEmail } from '../lib/emails.js';
import { ApiError, E } from '../lib/errors.js';
import { ageFrom, hashPassword, newCode, newToken, sha256, verifyPassword } from '../lib/security.js';
import * as dto from './dto.js';

export const SESSION_COOKIE = 'rj_session';
const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8).max(200);

async function startSession(ctx: Ctx, req: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 86400_000);
  await ctx.db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', expires: expiresAt, domain: config.COOKIE_DOMAIN,
  });
  // O app nativo (Capacitor) guarda o token no armazenamento seguro do aparelho
  return req.headers['x-client'] === 'app' ? token : undefined;
}

/** Gera um novo código de confirmação (os anteriores deixam de valer) e envia para o e-mail da conta. */
export async function sendVerifyCode(ctx: Ctx, u: Pick<UserRow, 'id' | 'email' | 'name' | 'lang'>) {
  const code = newCode();
  await ctx.db.update(emailCodes).set({ usedAt: new Date() }).where(and(eq(emailCodes.userId, u.id), isNull(emailCodes.usedAt)));
  await ctx.db.insert(emailCodes).values({ userId: u.id, email: u.email.toLowerCase(), codeHash: sha256(`${u.id}:${code}`), expiresAt: new Date(Date.now() + 30 * 60_000) });
  return ctx.mailer.send(u.email, renderEmail('verify_email', u.lang, { name: u.name.split(' ')[0], code }));
}

export default function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/signup', strict, async (req, reply) => {
    const body = parse(z.object({
      name: z.string().trim().min(2).max(80),
      email, password,
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      role: z.enum(['client', 'partner']).default('client'),
      lang: z.enum(['pt', 'es', 'en', 'zh']).default('pt'),
      acceptTerms: z.literal(true),
      privacyConsent: z.literal(true),
    }), req.body);
    const age = ageFrom(body.birthDate);
    if (age < 0 || age > 120) throw E.badRequest('invalid_birth_date');
    if (age < config.MIN_AGE) throw E.unprocessable('underage', 'O RolêJunto é exclusivo para maiores de 18 anos.');
    const exists = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${body.email}`);
    if (exists.length) throw E.conflict('email_taken', 'Este e-mail já tem uma conta.');
    const now = new Date();
    const [u] = await ctx.db.insert(users).values({
      name: body.name, email: body.email, passwordHash: await hashPassword(body.password), birthDate: body.birthDate,
      role: body.role, lang: body.lang, termsAcceptedAt: now, privacyConsentAt: now,
    }).returning();
    if (u.role === 'partner') await ctx.db.insert(partnerProfiles).values({ userId: u.id });
    await audit(ctx.db, req, 'user.signup', 'user', u.id, { role: u.role });
    await sendVerifyCode(ctx, u);
    const token = await startSession(ctx, req, reply, u.id);
    return reply.status(201).send({ user: dto.me(u), token });
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${body.email}`);
    if (u?.lockedUntil && u.lockedUntil > new Date()) throw E.tooMany('account_locked');
    if (!u || u.status === 'deleted' || !(await verifyPassword(body.password, u.passwordHash))) {
      if (u) {
        const failed = u.failedLogins + 1;
        await ctx.db.update(users).set({ failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60_000) : null }).where(eq(users.id, u.id));
      }
      throw new ApiError(401, 'invalid_credentials', 'E-mail ou senha incorretos.');
    }
    if (u.status === 'suspended') throw E.forbidden('account_suspended', 'Sua conta está suspensa. Fale com o suporte.');
    await ctx.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastSeenAt: new Date() }).where(eq(users.id, u.id));
    const token = await startSession(ctx, req, reply, u.id);
    return { user: dto.me(u), token };
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.sessionId) await ctx.db.delete(sessions).where(eq(sessions.id, req.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/', domain: config.COOKIE_DOMAIN });
    return { ok: true };
  });

  app.get('/auth/me', async (req) => ({ user: req.user ? dto.me(req.user) : null }));

  // Recuperação de senha: código de 6 dígitos por e-mail, válido por 15 min, até 5 tentativas
  app.post('/auth/forgot', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const body = parse(z.object({ email }), req.body);
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${body.email}`);
    if (u && u.status !== 'deleted') {
      const code = newCode();
      await ctx.db.insert(passwordResets).values({ userId: u.id, codeHash: sha256(`${u.id}:${code}`), expiresAt: new Date(Date.now() + 15 * 60_000) });
      await ctx.mailer.send(u.email, renderEmail('password_reset', u.lang, { name: u.name.split(' ')[0], code }));
    }
    return { ok: true }; // mesma resposta sempre, para não revelar se o e-mail existe
  });

  app.post('/auth/reset', strict, async (req) => {
    const body = parse(z.object({ email, code: z.string().regex(/^\d{6}$/), password }), req.body);
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${body.email}`);
    if (!u) throw E.badRequest('invalid_code', 'Código inválido ou expirado.');
    const [r] = await ctx.db.select().from(passwordResets)
      .where(and(eq(passwordResets.userId, u.id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
      .orderBy(desc(passwordResets.createdAt)).limit(1);
    if (!r || r.attempts >= 5) throw E.badRequest('invalid_code', 'Código inválido ou expirado.');
    if (r.codeHash !== sha256(`${u.id}:${body.code}`)) {
      await ctx.db.update(passwordResets).set({ attempts: r.attempts + 1 }).where(eq(passwordResets.id, r.id));
      throw E.badRequest('invalid_code', 'Código inválido ou expirado.');
    }
    await ctx.db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
    await ctx.db.update(users).set({ passwordHash: await hashPassword(body.password), failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, u.id));
    await ctx.db.delete(sessions).where(eq(sessions.userId, u.id)); // encerra todas as sessões
    await audit(ctx.db, req, 'user.password_reset', 'user', u.id);
    return { ok: true };
  });

  // ---------- Confirmação de e-mail ----------
  app.post('/auth/verify-email', strict, async (req) => {
    const u = requireUser(req);
    if (u.emailVerifiedAt) return { user: dto.me(u) };
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
    const [r] = await ctx.db.select().from(emailCodes)
      .where(and(eq(emailCodes.userId, u.id), isNull(emailCodes.usedAt), gt(emailCodes.expiresAt, new Date())))
      .orderBy(desc(emailCodes.createdAt)).limit(1);
    if (!r || r.attempts >= 5 || r.email !== u.email.toLowerCase()) throw E.badRequest('invalid_code', 'Código inválido ou expirado.');
    if (r.codeHash !== sha256(`${u.id}:${code}`)) {
      await ctx.db.update(emailCodes).set({ attempts: r.attempts + 1 }).where(eq(emailCodes.id, r.id));
      throw E.badRequest('invalid_code', 'Código inválido ou expirado.');
    }
    await ctx.db.update(emailCodes).set({ usedAt: new Date() }).where(eq(emailCodes.id, r.id));
    const [updated] = await ctx.db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, u.id)).returning();
    await audit(ctx.db, req, 'user.email_verified', 'user', u.id);
    return { user: dto.me(updated) };
  });

  app.post('/auth/verify-email/resend', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    if (u.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    const sent = await sendVerifyCode(ctx, u);
    if (!sent) throw new ApiError(503, 'email_failed', 'Não conseguimos enviar o e-mail agora. Tente de novo em instantes.');
    return { ok: true };
  });
}
