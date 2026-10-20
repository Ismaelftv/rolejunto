import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bookings, partnerProfiles, photos, reports, sessions, users, verifications } from '../db/schema.js';
import { audit, notify, parse, requireRole, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { ageFrom } from '../lib/security.js';
import { cancelBooking, participants } from './bookingService.js';

export default function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const admin = (req: Parameters<typeof requireRole>[0]) => requireRole(req, 'admin');

  app.get('/admin/metrics', async (req) => {
    admin(req);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const n = sql<number>`count(*)::int`;
    return {
      activeUsers: await count(ctx.db.select({ n }).from(users).where(and(eq(users.status, 'active'), gte(users.lastSeenAt, new Date(Date.now() - 30 * 86400_000))))),
      bookingsToday: await count(ctx.db.select({ n }).from(bookings).where(gte(bookings.createdAt, today))),
      verificationQueue: await count(ctx.db.select({ n }).from(verifications).where(eq(verifications.status, 'in_review'))),
      openReports: await count(ctx.db.select({ n }).from(reports).where(eq(reports.status, 'open'))),
      urgentReports: await count(ctx.db.select({ n }).from(reports).where(and(eq(reports.status, 'open'), eq(reports.priority, 'high')))),
      pendingPhotos: await count(ctx.db.select({ n }).from(photos).where(eq(photos.status, 'pending'))),
    };
  });

  // ---------- Verificações ----------
  app.get('/admin/verifications', async (req) => {
    admin(req);
    const rows = await ctx.db.select({ v: verifications, u: users }).from(verifications).innerJoin(users, eq(users.id, verifications.userId))
      .where(eq(verifications.status, 'in_review')).orderBy(verifications.createdAt).limit(100);
    return { items: rows.map(({ v, u }) => ({ id: v.id, userId: u.id, name: u.name, role: u.role, age: ageFrom(u.birthDate), docAge: v.docAge, matchScore: v.matchScore, createdAt: v.createdAt })) };
  });

  app.post<{ Params: { id: string; action: string } }>('/admin/verifications/:id/:action', async (req) => {
    const a = admin(req);
    const action = parse(z.enum(['approve', 'reject']), req.params.action);
    const [v] = await ctx.db.select().from(verifications).where(eq(verifications.id, req.params.id));
    if (!v) throw E.notFound();
    const status = action === 'approve' ? 'verified' : 'rejected';
    await ctx.db.update(verifications).set({ status, reviewedBy: a.id, decidedAt: new Date() }).where(eq(verifications.id, v.id));
    await ctx.db.update(users).set({ verification: status }).where(eq(users.id, v.userId));
    await notify(ctx.db, v.userId, status === 'verified' ? 'verification_approved' : 'verification_rejected', {}, '/verificacao');
    await audit(ctx.db, req, `verification.${action}`, 'user', v.userId);
    return { ok: true };
  });

  // ---------- Denúncias ----------
  app.get('/admin/reports', async (req) => {
    admin(req);
    const { status } = parse(z.object({ status: z.enum(['open', 'warned', 'suspended', 'archived']).default('open') }), req.query);
    const rows = await ctx.db.select().from(reports).where(eq(reports.status, status))
      .orderBy(sql`case ${reports.priority} when 'high' then 0 when 'medium' then 1 else 2 end`, desc(reports.createdAt)).limit(200);
    const people = await participants(ctx.db, [...new Set(rows.flatMap((r) => [r.targetId, r.reporterId].filter(Boolean) as string[]))]);
    return { items: rows.map((r) => ({ ...r, targetName: people.get(r.targetId)?.name ?? '', reporterName: r.reporterId ? people.get(r.reporterId)?.name ?? '' : 'Moderação automática' })) };
  });

  app.post<{ Params: { id: string } }>('/admin/reports/:id/action', async (req) => {
    const a = admin(req);
    const { action, note } = parse(z.object({ action: z.enum(['warn', 'suspend', 'archive']), note: z.string().max(500).default('') }), req.body);
    const [r] = await ctx.db.select().from(reports).where(eq(reports.id, req.params.id));
    if (!r) throw E.notFound();
    const status = action === 'warn' ? 'warned' : action === 'suspend' ? 'suspended' : 'archived';
    await ctx.db.update(reports).set({ status, handledBy: a.id, handledAt: new Date() }).where(eq(reports.id, r.id));
    if (action === 'warn') await notify(ctx.db, r.targetId, 'account_warning', { reason: r.reason });
    if (action === 'suspend') await suspendUser(r.targetId, a.id);
    await audit(ctx.db, req, `report.${action}`, 'user', r.targetId, { reportId: r.id, note });
    return { ok: true };
  });

  async function suspendUser(userId: string, actorId: string) {
    await ctx.db.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
    await ctx.db.delete(sessions).where(eq(sessions.userId, userId));
    await ctx.db.update(partnerProfiles).set({ visible: false }).where(eq(partnerProfiles.userId, userId));
    // Cancela reservas abertas; a outra parte recebe reembolso integral
    const open = await ctx.db.select().from(bookings).where(and(or(eq(bookings.clientId, userId), eq(bookings.partnerId, userId)), inArray(bookings.status, ['requested', 'accepted'])));
    for (const b of open) await cancelBooking(ctx, b, actorId, { forceFullRefund: true });
  }

  // ---------- Fotos e avaliações retidas ----------
  app.get('/admin/photos', async (req) => {
    admin(req);
    const rows = await ctx.db.select({ p: photos, name: users.name }).from(photos).innerJoin(users, eq(users.id, photos.partnerId)).where(eq(photos.status, 'pending')).orderBy(photos.createdAt).limit(100);
    return { items: rows.map(({ p, name }) => ({ ...p, partnerName: name })) };
  });
  app.post<{ Params: { id: string; action: string } }>('/admin/photos/:id/:action', async (req) => {
    admin(req);
    const action = parse(z.enum(['approve', 'reject']), req.params.action);
    const [p] = await ctx.db.update(photos).set({ status: action === 'approve' ? 'approved' : 'rejected' }).where(eq(photos.id, req.params.id)).returning();
    if (!p) throw E.notFound();
    if (action === 'reject') await notify(ctx.db, p.partnerId, 'photo_rejected', {}, '/painel');
    await audit(ctx.db, req, `photo.${action}`, 'photo', p.id);
    return { ok: true };
  });
  // ---------- Usuários ----------
  app.get('/admin/users', async (req) => {
    admin(req);
    const { q } = parse(z.object({ q: z.string().trim().max(80).default('') }), req.query);
    const rows = await ctx.db.select().from(users).where(q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined).orderBy(desc(users.createdAt)).limit(100);
    return { items: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, verification: u.verification, status: u.status, createdAt: u.createdAt })) };
  });
  app.post<{ Params: { id: string } }>('/admin/users/:id/suspend', async (req) => {
    const a = admin(req);
    await suspendUser(req.params.id, a.id);
    await audit(ctx.db, req, 'user.suspend', 'user', req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/admin/users/:id/reinstate', async (req) => {
    admin(req);
    await ctx.db.update(users).set({ status: 'active' }).where(and(eq(users.id, req.params.id), eq(users.status, 'suspended')));
    await audit(ctx.db, req, 'user.reinstate', 'user', req.params.id);
    return { ok: true };
  });
}
