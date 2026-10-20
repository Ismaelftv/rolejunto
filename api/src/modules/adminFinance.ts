// Painel administrativo: financeiro e repasses, todas as reservas, avaliações retidas, histórico de ações e crescimento.
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auditLogs, bookings, payments, payouts, reviews, users } from '../db/schema.js';
import { audit, notify, parse, requireRole, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { cancelBooking, participants, recomputeRating } from './bookingService.js';
import { config, isProd } from '../config.js';
import { renderEmail } from '../lib/emails.js';
import { mailStatus } from '../providers/messaging.js';

/** Dia (AAAA-MM-DD) no horário de Brasília. */
const brDay = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const monthStart = () => { const n = new Date(Date.now() - 3 * 3600_000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1, 3)); };

export default function adminFinanceRoutes(app: FastifyInstance, ctx: Ctx) {
  const admin = (req: Parameters<typeof requireRole>[0]) => requireRole(req, 'admin');

  // ---------- Crescimento (gráficos da visão geral) ----------
  app.get('/admin/stats/growth', async (req) => {
    admin(req);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }), req.query);
    const since = new Date(Date.now() - days * 86400_000);
    const [us, bs, ps] = await Promise.all([
      ctx.db.select({ role: users.role, createdAt: users.createdAt }).from(users).where(gte(users.createdAt, since)),
      ctx.db.select({ createdAt: bookings.createdAt, completedAt: bookings.completedAt, status: bookings.status }).from(bookings).where(gte(bookings.createdAt, new Date(since.getTime() - 30 * 86400_000))),
      ctx.db.select({ paidAt: payments.paidAt, status: payments.status, feeCents: bookings.feeCents }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).where(gte(payments.paidAt, since)),
    ]);
    const series = Array.from({ length: days }, (_, i) => {
      const date = brDay(new Date(Date.now() - (days - 1 - i) * 86400_000));
      return { date, clients: 0, partners: 0, bookings: 0, completed: 0, revenueCents: 0 };
    });
    const at = new Map(series.map((s) => [s.date, s]));
    for (const u of us) { const s = at.get(brDay(u.createdAt)); if (s && u.role !== 'admin') s[u.role === 'partner' ? 'partners' : 'clients']++; }
    for (const b of bs) {
      const c = at.get(brDay(b.createdAt)); if (c) c.bookings++;
      if (b.completedAt) { const d = at.get(brDay(b.completedAt)); if (d) d.completed++; }
    }
    for (const p of ps) { if (p.paidAt && p.status !== 'refunded') { const s = at.get(brDay(p.paidAt)); if (s) s.revenueCents += p.feeCents; } }
    return { series };
  });

  // ---------- Financeiro ----------
  app.get('/admin/finance', async (req) => {
    admin(req);
    const { period } = parse(z.object({ period: z.enum(['month', 'all']).default('month') }), req.query);
    const from = period === 'month' ? monthStart() : new Date(0);
    const paid = await ctx.db.select({ p: payments, b: bookings }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(and(gte(payments.paidAt, from), inArray(payments.status, ['paid', 'refunded', 'partially_refunded'])));
    const open = await ctx.db.select().from(bookings).where(inArray(bookings.paymentStatus, ['paid', 'released']));
    const owedRows = open.filter((b) => b.paymentStatus === 'released' && !b.payoutId);
    const byPartner = new Map<string, { partnerId: string; bookingsCount: number; amountCents: number }>();
    for (const b of owedRows) {
      const x = byPartner.get(b.partnerId) ?? { partnerId: b.partnerId, bookingsCount: 0, amountCents: 0 };
      x.bookingsCount++; x.amountCents += b.subtotalCents; byPartner.set(b.partnerId, x);
    }
    const recent = await ctx.db.select().from(payouts).orderBy(desc(payouts.createdAt)).limit(50);
    const people = await participants(ctx.db, [...new Set([...byPartner.keys(), ...recent.map((r) => r.partnerId)])]);
    const contact = byPartner.size ? await ctx.db.select({ id: users.id, email: users.email, phone: users.phone }).from(users).where(inArray(users.id, [...byPartner.keys()])) : [];
    const contactOf = new Map(contact.map((c) => [c.id, c]));
    return {
      period,
      grossCents: paid.reduce((s, x) => s + x.p.amountCents, 0),
      feesCents: paid.filter((x) => x.p.status !== 'refunded').reduce((s, x) => s + x.b.feeCents, 0),
      refundedCents: paid.reduce((s, x) => s + x.p.refundedCents, 0),
      heldCents: open.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.subtotalCents, 0),
      owedCents: owedRows.reduce((s, b) => s + b.subtotalCents, 0),
      pendingPayouts: [...byPartner.values()].sort((a, b) => b.amountCents - a.amountCents).map((x) => ({
        ...x, name: people.get(x.partnerId)?.name ?? '', email: contactOf.get(x.partnerId)?.email ?? '', phone: contactOf.get(x.partnerId)?.phone ?? null,
      })),
      recentPayouts: recent.map((r) => ({ id: r.id, partnerId: r.partnerId, name: people.get(r.partnerId)?.name ?? '', amountCents: r.amountCents, bookingsCount: r.bookingsCount, note: r.note, createdAt: r.createdAt })),
    };
  });

  app.get('/admin/payments', async (req) => {
    admin(req);
    const rows = await ctx.db.select({ p: payments, b: bookings }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).orderBy(desc(payments.createdAt)).limit(100);
    const people = await participants(ctx.db, [...new Set(rows.flatMap((r) => [r.b.clientId, r.b.partnerId]))]);
    return {
      items: rows.map(({ p, b }) => ({
        id: p.id, bookingId: b.id, createdAt: p.createdAt, paidAt: p.paidAt, status: p.status, method: p.method, amountCents: p.amountCents, refundedCents: p.refundedCents,
        provider: p.provider, ref: p.providerRef, clientName: people.get(b.clientId)?.name ?? '', partnerName: people.get(b.partnerId)?.name ?? '',
      })),
    };
  });

  // Registra o repasse (o Pix ao parceiro é feito pelo banco; aqui fica o controle)
  app.post('/admin/payouts', async (req, reply) => {
    const a = admin(req);
    const { partnerId, note } = parse(z.object({ partnerId: z.string().uuid(), note: z.string().trim().max(300).default('') }), req.body);
    const due = await ctx.db.select().from(bookings).where(and(eq(bookings.partnerId, partnerId), eq(bookings.paymentStatus, 'released'), isNull(bookings.payoutId)));
    if (!due.length) throw E.conflict('nothing_to_pay', 'Não há valores a repassar para este parceiro.');
    const amount = due.reduce((s, b) => s + b.subtotalCents, 0);
    const [p] = await ctx.db.insert(payouts).values({ partnerId, amountCents: amount, bookingsCount: due.length, note, createdBy: a.id }).returning();
    await ctx.db.update(bookings).set({ payoutId: p.id }).where(inArray(bookings.id, due.map((b) => b.id)));
    await notify(ctx.db, partnerId, 'payout_sent', { amountCents: amount }, '/painel');
    await audit(ctx.db, req, 'payout.create', 'user', partnerId, { amountCents: amount, bookings: due.length });
    return reply.status(201).send({ payout: p });
  });

  // ---------- Todas as reservas ----------
  app.get('/admin/bookings', async (req) => {
    admin(req);
    const { status, q } = parse(z.object({
      status: z.enum(['requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'declined']).optional(),
      q: z.string().trim().max(80).default(''),
    }), req.query);
    const rows = await ctx.db.select().from(bookings).where(status ? eq(bookings.status, status) : undefined).orderBy(desc(bookings.startsAt)).limit(500);
    const people = await participants(ctx.db, [...new Set(rows.flatMap((b) => [b.clientId, b.partnerId]))]);
    const text = q.toLowerCase();
    return {
      items: rows.map((b) => ({
        id: b.id, startsAt: b.startsAt, createdAt: b.createdAt, activity: b.activity, hours: b.hours, place: b.place, privateVenue: b.privateVenue,
        totalCents: b.totalCents, feeCents: b.feeCents, status: b.status, paymentStatus: b.paymentStatus, payoutId: b.payoutId,
        clientName: people.get(b.clientId)?.name ?? '', partnerName: people.get(b.partnerId)?.name ?? '',
      })).filter((b) => !text || `${b.clientName} ${b.partnerName} ${b.place}`.toLowerCase().includes(text)).slice(0, 200),
    };
  });

  app.post<{ Params: { id: string } }>('/admin/bookings/:id/cancel', async (req) => {
    const a = admin(req);
    const [b] = await ctx.db.select().from(bookings).where(eq(bookings.id, parse(z.string().uuid(), req.params.id)));
    if (!b) throw E.notFound('booking_not_found');
    if (!['requested', 'accepted', 'in_progress'].includes(b.status)) throw E.conflict('invalid_status', 'Esta reserva não pode mais ser cancelada.');
    const x = await cancelBooking(ctx, b, a.id, { forceFullRefund: true });
    await notify(ctx.db, b.partnerId, 'booking_cancelled', { bookingId: b.id }, '/painel'); // o cliente já é avisado pelo cancelamento
    await audit(ctx.db, req, 'booking.admin_cancel', 'booking', b.id);
    return { booking: { id: x.id, status: x.status, paymentStatus: x.paymentStatus } };
  });

  // ---------- Avaliações retidas pela moderação ----------
  app.get('/admin/reviews', async (req) => {
    admin(req);
    const rows = await ctx.db.select().from(reviews).where(eq(reviews.hidden, true)).orderBy(desc(reviews.createdAt)).limit(100);
    const people = await participants(ctx.db, [...new Set(rows.flatMap((r) => [r.authorId, r.targetId]))]);
    return { items: rows.map((r) => ({ id: r.id, rating: r.rating, text: r.text, createdAt: r.createdAt, authorName: people.get(r.authorId)?.name ?? '', targetName: people.get(r.targetId)?.name ?? '' })) };
  });
  app.post<{ Params: { id: string; action: string } }>('/admin/reviews/:id/:action', async (req) => {
    admin(req);
    const action = parse(z.enum(['show', 'delete']), req.params.action);
    const id = parse(z.string().uuid(), req.params.id);
    const [r] = action === 'show'
      ? await ctx.db.update(reviews).set({ hidden: false }).where(eq(reviews.id, id)).returning()
      : await ctx.db.delete(reviews).where(eq(reviews.id, id)).returning();
    if (!r) throw E.notFound();
    await recomputeRating(ctx.db, r.targetId);
    await audit(ctx.db, req, `review.${action}`, 'review', r.id);
    return { ok: true };
  });

  // ---------- Histórico de ações (auditoria) ----------
  app.get('/admin/audit', async (req) => {
    admin(req);
    const { targetId, action } = parse(z.object({ targetId: z.string().optional(), action: z.string().max(40).optional() }), req.query);
    const rows = await ctx.db.select().from(auditLogs).where(targetId ? eq(auditLogs.targetId, targetId) : undefined).orderBy(desc(auditLogs.createdAt)).limit(500);
    const list = rows.filter((r) => !action || r.action.startsWith(action)).slice(0, 200);
    const people = await participants(ctx.db, [...new Set(list.flatMap((r) => [r.actorId, r.targetType === 'user' ? r.targetId : null].filter((x): x is string => !!x)))]);
    return {
      items: list.map((r) => ({
        id: r.id, action: r.action, createdAt: r.createdAt, ip: r.ip, targetType: r.targetType, targetId: r.targetId, data: r.data,
        actorName: r.actorId ? people.get(r.actorId)?.name ?? '' : null, targetName: r.targetType === 'user' && r.targetId ? people.get(r.targetId)?.name ?? '' : null,
      })),
    };
  });

  // ---------- Sistema: situação dos serviços e teste de e-mail ----------
  app.get('/admin/system', async (req) => {
    admin(req);
    const email = req.query && (req.query as { check?: string }).check === '1' ? await ctx.mailer.check() : { ...mailStatus };
    return {
      env: config.NODE_ENV,
      email,
      payments: { provider: ctx.payments.name, webhookSecret: !!config.MERCADOPAGO_WEBHOOK_SECRET },
      verification: { provider: config.VERIFICATION_PROVIDER, autoApprove: !isProd },
      appUrl: config.APP_URL.split(',')[0],
    };
  });

  app.post('/admin/system/test-email', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const a = admin(req);
    const { to } = parse(z.object({ to: z.string().trim().email().max(200).optional() }), req.body ?? {});
    const dest = to ?? a.email;
    if (ctx.mailer.mode === 'console') return { ok: false, to: dest, status: { ...mailStatus } };
    const ok = await ctx.mailer.send(dest, renderEmail('verify_email', a.lang, { name: a.name.split(' ')[0], code: '123456' }));
    await audit(ctx.db, req, 'system.test_email', 'user', a.id, { ok });
    return { ok, to: dest, status: { ...mailStatus } };
  });
}
