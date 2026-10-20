import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config, isProd } from '../config.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { emailCodes, oauthAccounts, partnerProfiles, passwordResets, sessions, users } from '../db/schema.js';
import { findReferrer } from './growth.js';
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
      ref: z.string().trim().max(40).optional(),
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
      referredBy: body.role === 'client' ? await findReferrer(ctx.db, body.ref) : null,
    }).returning();
    if (u.role === 'partner') await ctx.db.insert(partnerProfiles).values({ userId: u.id });
    await audit(ctx.db, req, 'user.signup', 'user', u.id, { role: u.role, referred: !!u.referredBy });
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

  // ---------- Login com Google / Apple ----------
  // 1) O app manda o ID token do provedor. Conta já ligada → entra. E-mail confirmado de conta existente → liga e entra.
  // 2) Pessoa nova → devolvemos um "ticket" assinado; ela completa nome, nascimento (18+) e aceite dos termos.
  const ticketSign = (payload: string) => createHmac('sha256', config.COOKIE_SECRET).update(`oauth:${payload}`).digest('base64url');
  const makeTicket = (data: object) => {
    const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + 30 * 60_000 })).toString('base64url');
    return `${payload}.${ticketSign(payload)}`;
  };
  const readTicket = (t: string) => {
    const [payload, sig] = t.split('.');
    const good = payload && sig ? ticketSign(payload) : '';
    if (!good || good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) throw E.badRequest('oauth_ticket_invalid', 'Sessão de login expirada. Tente de novo.');
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { provider: 'google' | 'apple'; subject: string; email: string; name: string | null; exp: number };
    if (d.exp < Date.now()) throw E.badRequest('oauth_ticket_invalid', 'Sessão de login expirada. Tente de novo.');
    return d;
  };
  const loginExisting = async (req: FastifyRequest, reply: FastifyReply, u: UserRow) => {
    if (u.status === 'deleted') throw new ApiError(401, 'invalid_credentials', 'Conta não encontrada.');
    if (u.status === 'suspended') throw E.forbidden('account_suspended', 'Sua conta está suspensa. Fale com o suporte.');
    const [fresh] = await ctx.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastSeenAt: new Date(), emailVerifiedAt: u.emailVerifiedAt ?? new Date() }).where(eq(users.id, u.id)).returning();
    const token = await startSession(ctx, req, reply, u.id);
    return { user: dto.me(fresh), token };
  };

  app.post('/auth/oauth', strict, async (req, reply) => {
    const body = parse(z.object({ provider: z.enum(['google', 'apple']), idToken: z.string().min(20).max(5000), name: z.string().trim().max(80).optional() }), req.body);
    let id;
    try { id = await ctx.oauth.verify(body.provider, body.idToken); } catch (e) {
      if ((e as Error).message === 'not_configured') throw E.badRequest('oauth_not_configured', 'Este tipo de login ainda não está ativo.');
      throw new ApiError(401, 'oauth_invalid', 'Não foi possível confirmar o login. Tente de novo.');
    }
    const [linked] = await ctx.db.select().from(oauthAccounts).where(and(eq(oauthAccounts.provider, body.provider), eq(oauthAccounts.subject, id.subject)));
    if (linked) {
      const [u] = await ctx.db.select().from(users).where(eq(users.id, linked.userId));
      if (u) return loginExisting(req, reply, u);
    }
    if (!id.email || !id.emailVerified) throw E.unprocessable('oauth_email_required', 'Precisamos de um e-mail confirmado na sua conta Google/Apple.');
    const email = id.email.toLowerCase();
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (u) {
      await ctx.db.insert(oauthAccounts).values({ provider: body.provider, subject: id.subject, userId: u.id, email }).onConflictDoNothing();
      await audit(ctx.db, req, 'user.oauth_link', 'user', u.id, { provider: body.provider });
      return loginExisting(req, reply, u);
    }
    return { needsProfile: true, ticket: makeTicket({ provider: body.provider, subject: id.subject, email, name: id.name ?? body.name ?? null }), email, name: id.name ?? body.name ?? null };
  });

  app.post('/auth/oauth/complete', strict, async (req, reply) => {
    const body = parse(z.object({
      ticket: z.string().min(10).max(4000),
      name: z.string().trim().min(2).max(80),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      role: z.enum(['client', 'partner']).default('client'),
      lang: z.enum(['pt', 'es', 'en', 'zh']).default('pt'),
      acceptTerms: z.literal(true),
      privacyConsent: z.literal(true),
      ref: z.string().trim().max(40).optional(),
    }), req.body);
    const t = readTicket(body.ticket);
    const age = ageFrom(body.birthDate);
    if (age < 0 || age > 120) throw E.badRequest('invalid_birth_date');
    if (age < config.MIN_AGE) throw E.unprocessable('underage', 'O RolêJunto é exclusivo para maiores de 18 anos.');
    const [taken] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${t.email}`);
    if (taken) throw E.conflict('email_taken', 'Este e-mail já tem uma conta.');
    const now = new Date();
    const [u] = await ctx.db.insert(users).values({
      name: body.name, email: t.email, passwordHash: `oauth$${newToken()}`, birthDate: body.birthDate,
      role: body.role, lang: body.lang, termsAcceptedAt: now, privacyConsentAt: now, emailVerifiedAt: now,
      referredBy: body.role === 'client' ? await findReferrer(ctx.db, body.ref) : null,
    }).returning();
    await ctx.db.insert(oauthAccounts).values({ provider: t.provider, subject: t.subject, userId: u.id, email: t.email });
    if (u.role === 'partner') await ctx.db.insert(partnerProfiles).values({ userId: u.id });
    await audit(ctx.db, req, 'user.signup', 'user', u.id, { role: u.role, provider: t.provider, referred: !!u.referredBy });
    const token = await startSession(ctx, req, reply, u.id);
    return reply.status(201).send({ user: dto.me(u), token });
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
