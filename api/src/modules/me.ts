import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bookings, favorites, messages, oauthAccounts, partnerProfiles, reports, reviews, sessions, users } from '../db/schema.js';
import { audit, parse, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/security.js';
import { imageExt } from '../providers/storage.js';
import { cancelBooking } from './bookingService.js';
import * as dto from './dto.js';
import { sendVerifyCode } from './auth.js';
import { ACTIVITIES } from './partners.js';

export default function meRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/me', async (req) => ({ user: dto.me(requireUser(req)) }));

  app.patch('/me', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: z.string().trim().toLowerCase().email().max(200).optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      city: z.string().trim().max(80).nullable().optional(),
      lang: z.enum(['pt', 'es', 'en', 'zh']).optional(),
      interests: z.array(z.enum(ACTIVITIES)).max(20).optional(),
      notifications: z.object({ email: z.boolean(), push: z.boolean(), promos: z.boolean() }).optional(),
      trustedContact: z.object({ name: z.string().trim().max(80), phone: z.string().trim().min(8).max(30) }).nullable().optional(),
    }), req.body);
    const emailChanged = !!b.email && b.email !== u.email.toLowerCase();
    if (emailChanged) {
      const taken = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${b.email}`);
      if (taken.length) throw E.conflict('email_taken', 'Este e-mail já tem uma conta.');
    }
    const [updated] = await ctx.db.update(users).set({
      name: b.name, email: b.email, phone: b.phone, city: b.city, lang: b.lang, interests: b.interests,
      notifEmail: b.notifications?.email, notifPush: b.notifications?.push, notifPromos: b.notifications?.promos,
      ...(b.trustedContact !== undefined ? { trustedContactName: b.trustedContact?.name ?? null, trustedContactPhone: b.trustedContact?.phone ?? null } : {}),
      ...(emailChanged ? { emailVerifiedAt: null } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, u.id)).returning();
    if (emailChanged) await sendVerifyCode(ctx, updated); // o novo e-mail precisa ser confirmado
    return { user: dto.me(updated) };
  });

  app.post('/me/password', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ current: z.string().min(1).optional(), next: z.string().min(8).max(200) }), req.body);
    // conta do Google/Apple pode criar a primeira senha sem informar a atual
    if (dto.hasPassword(u) && !(b.current && (await verifyPassword(b.current, u.passwordHash)))) throw E.badRequest('wrong_password', 'Senha atual incorreta.');
    await ctx.db.update(users).set({ passwordHash: await hashPassword(b.next), updatedAt: new Date() }).where(eq(users.id, u.id));
    // encerra as outras sessões
    await ctx.db.delete(sessions).where(and(eq(sessions.userId, u.id), sql`${sessions.id} <> ${req.sessionId ?? null}`));
    await audit(ctx.db, req, 'user.password_change', 'user', u.id);
    return { ok: true };
  });

  app.post('/me/avatar', async (req) => {
    const u = requireUser(req);
    const file = await req.file();
    if (!file) throw E.badRequest('file_required');
    const buf = await file.toBuffer();
    const ext = imageExt(buf);
    if (!ext) throw E.badRequest('invalid_image', 'Envie uma imagem JPG, PNG ou WEBP.');
    const url = await ctx.storage.save(buf, ext);
    if (u.avatarUrl) await ctx.storage.remove(u.avatarUrl);
    const [updated] = await ctx.db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, u.id)).returning();
    return { user: dto.me(updated) };
  });

  app.delete('/me/avatar', async (req) => {
    const u = requireUser(req);
    if (u.avatarUrl) await ctx.storage.remove(u.avatarUrl);
    const [updated] = await ctx.db.update(users).set({ avatarUrl: null }).where(eq(users.id, u.id)).returning();
    return { user: dto.me(updated) };
  });

  // Favoritos
  app.get('/me/favorites', async (req) => {
    const u = requireUser(req);
    const rows = await ctx.db.select({ partnerId: favorites.partnerId }).from(favorites).where(eq(favorites.userId, u.id));
    return { partnerIds: rows.map((r) => r.partnerId) };
  });
  app.put<{ Params: { id: string } }>('/me/favorites/:id', async (req) => {
    const u = requireUser(req);
    await ctx.db.insert(favorites).values({ userId: u.id, partnerId: req.params.id }).onConflictDoNothing();
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>('/me/favorites/:id', async (req) => {
    const u = requireUser(req);
    await ctx.db.delete(favorites).where(and(eq(favorites.userId, u.id), eq(favorites.partnerId, req.params.id)));
    return { ok: true };
  });

  // LGPD: portabilidade (baixar meus dados)
  app.get('/me/export', async (req, reply) => {
    const u = requireUser(req);
    const [myBookings, mySentMessages, myReviews, myReports, myFavs, profile] = await Promise.all([
      ctx.db.select().from(bookings).where(or(eq(bookings.clientId, u.id), eq(bookings.partnerId, u.id))),
      ctx.db.select({ body: messages.body, createdAt: messages.createdAt }).from(messages).where(eq(messages.senderId, u.id)),
      ctx.db.select().from(reviews).where(eq(reviews.authorId, u.id)),
      ctx.db.select({ reason: reports.reason, details: reports.details, createdAt: reports.createdAt }).from(reports).where(eq(reports.reporterId, u.id)),
      ctx.db.select().from(favorites).where(eq(favorites.userId, u.id)),
      ctx.db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, u.id)),
    ]);
    reply.header('Content-Disposition', 'attachment; filename="rolejunto-meus-dados.json"');
    return { exportedAt: new Date(), account: dto.me(u), partnerProfile: profile[0] ?? null, bookings: myBookings, messagesSent: mySentMessages, reviewsWritten: myReviews, reportsMade: myReports, favorites: myFavs };
  });

  // LGPD: exclusão. Dados financeiros ficam anonimizados pelo prazo legal; o resto é apagado.
  app.delete('/me', async (req, reply) => {
    const u = requireUser(req);
    // Quem entrou só com Google/Apple não tem senha: confirma com "confirm: true"
    const b = parse(z.object({ password: z.string().min(1).optional(), confirm: z.literal(true).optional() }), req.body);
    if (dto.hasPassword(u) ? !(b.password && (await verifyPassword(b.password, u.passwordHash))) : !b.confirm) throw E.badRequest('wrong_password', 'Senha incorreta.');
    const open = await ctx.db.select().from(bookings).where(and(or(eq(bookings.clientId, u.id), eq(bookings.partnerId, u.id)), inArray(bookings.status, ['requested', 'accepted'])));
    for (const bk of open) await cancelBooking(ctx, bk, u.id, { forceFullRefund: bk.partnerId === u.id });
    if (u.avatarUrl) await ctx.storage.remove(u.avatarUrl);
    await ctx.db.update(users).set({
      email: `removido+${u.id}@rolejunto.invalid`, name: 'Usuário removido', phone: null, city: null, avatarUrl: null,
      trustedContactName: null, trustedContactPhone: null, interests: [], status: 'deleted', deletedAt: new Date(), passwordHash: 'x',
      referralCode: null,
    }).where(eq(users.id, u.id));
    await ctx.db.delete(oauthAccounts).where(eq(oauthAccounts.userId, u.id));
    await ctx.db.update(partnerProfiles).set({ visible: false, bio: '', about: '', approxLat: null, approxLng: null }).where(eq(partnerProfiles.userId, u.id));
    await ctx.db.delete(favorites).where(eq(favorites.userId, u.id));
    await ctx.db.delete(sessions).where(eq(sessions.userId, u.id));
    await audit(ctx.db, req, 'user.delete', 'user', u.id);
    reply.clearCookie('rj_session', { path: '/' });
    return { ok: true };
  });
}
