import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { config, isProd } from '../config.js';
import { bookings, payments } from '../db/schema.js';
import { audit, notify, parse, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { mockProvider } from '../providers/payments.js';
import { systemMessage } from './bookingService.js';

const payDto = (p: typeof payments.$inferSelect, test = false) => ({
  test, // true quando o provedor é o de testes (mock)
  id: p.id, bookingId: p.bookingId, method: p.method, amountCents: p.amountCents, status: p.status,
  pixCode: p.pixCode, pixQrBase64: p.pixQrBase64, checkoutUrl: p.checkoutUrl, expiresAt: p.expiresAt, paidAt: p.paidAt, ref: p.providerRef,
});

export async function markPaid(ctx: Ctx, paymentId: string) {
  const [p] = await ctx.db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p || p.status === 'paid') return p;
  const [updated] = await ctx.db.update(payments).set({ status: 'paid', paidAt: new Date() }).where(eq(payments.id, p.id)).returning();
  const [b] = await ctx.db.update(bookings).set({ paymentStatus: 'paid', paymentMethod: p.method, updatedAt: new Date() }).where(eq(bookings.id, p.bookingId)).returning();
  await notify(ctx.db, b.clientId, 'payment_confirmed', { bookingId: b.id }, `/reservas/${b.id}`);
  await notify(ctx.db, b.partnerId, 'payment_confirmed_partner', { bookingId: b.id }, `/painel`);
  await systemMessage(ctx.db, b, 'payment_confirmed', { bookingId: b.id });
  await audit(ctx.db, null, 'payment.paid', 'payment', p.id, { amountCents: p.amountCents });
  return updated;
}

export default function paymentRoutes(app: FastifyInstance, ctx: Ctx) {
  // Cria (ou reaproveita) a cobrança da reserva
  app.post<{ Params: { id: string } }>('/bookings/:id/payment', async (req) => {
    const u = requireUser(req);
    const { method } = parse(z.object({ method: z.enum(['pix', 'card']) }), req.body);
    const [b] = await ctx.db.select().from(bookings).where(eq(bookings.id, parse(z.string().uuid(), req.params.id)));
    if (!b || b.clientId !== u.id) throw E.notFound('booking_not_found');
    if (b.status !== 'accepted') throw E.conflict('not_accepted', 'O pagamento fica disponível depois que o parceiro aceitar.');
    if (b.paymentStatus === 'paid') throw E.conflict('already_paid', 'Esta reserva já está paga.');
    const [existing] = await ctx.db.select().from(payments)
      .where(and(eq(payments.bookingId, b.id), eq(payments.method, method), eq(payments.status, 'pending'), gt(payments.expiresAt, new Date())))
      .orderBy(desc(payments.createdAt)).limit(1);
    if (existing) return { payment: payDto(existing, ctx.payments.name === 'mock') };
    const [p] = await ctx.db.insert(payments).values({
      bookingId: b.id, provider: ctx.payments.name, method, amountCents: b.totalCents, status: 'pending', expiresAt: new Date(Date.now() + 15 * 60_000),
    }).returning();
    const description = `RolêJunto · reserva ${b.id.slice(0, 8).toUpperCase()}`;
    const appUrl = config.APP_URL.split(',')[0];
    if (method === 'pix') {
      const r = await ctx.payments.createPix({ paymentId: p.id, amountCents: b.totalCents, description, payerEmail: u.email });
      const [x] = await ctx.db.update(payments).set({ providerRef: r.providerRef, pixCode: r.pixCode, pixQrBase64: r.pixQrBase64, expiresAt: r.expiresAt }).where(eq(payments.id, p.id)).returning();
      await ctx.db.update(bookings).set({ paymentStatus: 'pending' }).where(eq(bookings.id, b.id));
      return { payment: payDto(x, ctx.payments.name === 'mock') };
    }
    const r = await ctx.payments.createCard({ paymentId: p.id, amountCents: b.totalCents, description, payerEmail: u.email, returnUrl: `${appUrl}/reservas/${b.id}/pagar` });
    const [x] = await ctx.db.update(payments).set({ providerRef: r.providerRef, checkoutUrl: r.checkoutUrl, expiresAt: new Date(Date.now() + 60 * 60_000) }).where(eq(payments.id, p.id)).returning();
    await ctx.db.update(bookings).set({ paymentStatus: 'pending' }).where(eq(bookings.id, b.id));
    return { payment: payDto(x, ctx.payments.name === 'mock') };
  });

  // Último pagamento da reserva (para o comprovante)
  app.get<{ Params: { id: string } }>('/bookings/:id/payment', async (req) => {
    const u = requireUser(req);
    const [b] = await ctx.db.select().from(bookings).where(eq(bookings.id, parse(z.string().uuid(), req.params.id)));
    if (!b || b.clientId !== u.id) throw E.notFound('booking_not_found');
    const rows = await ctx.db.select().from(payments).where(eq(payments.bookingId, b.id)).orderBy(desc(payments.createdAt));
    const p = rows.find((x) => x.status === 'paid' || x.status === 'refunded' || x.status === 'partially_refunded') ?? rows[0];
    return { payment: p ? payDto(p, ctx.payments.name === 'mock') : null };
  });

  // Situação do pagamento (o app consulta quando o cliente toca em "Já paguei")
  app.get<{ Params: { id: string } }>('/payments/:id', async (req) => {
    const u = requireUser(req);
    const [p] = await ctx.db.select({ p: payments, b: bookings }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(eq(payments.id, parse(z.string().uuid(), req.params.id)));
    if (!p || p.b.clientId !== u.id) throw E.notFound();
    let pay = p.p;
    if (pay.status === 'pending' && pay.providerRef) {
      const s = await ctx.payments.getStatus({ providerRef: pay.providerRef, paymentId: pay.id, method: pay.method });
      if (s === 'paid') pay = (await markPaid(ctx, pay.id))!;
    }
    return { payment: payDto(pay, ctx.payments.name === 'mock') };
  });

  // Somente em desenvolvimento: simula a confirmação do pagamento
  app.post<{ Params: { id: string } }>('/payments/:id/simulate', async (req) => {
    if (isProd || ctx.payments.name !== 'mock') throw E.notFound();
    const u = requireUser(req);
    const [p] = await ctx.db.select({ p: payments, b: bookings }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).where(eq(payments.id, req.params.id));
    if (!p || p.b.clientId !== u.id) throw E.notFound();
    if (p.p.providerRef) mockProvider.simulatePaid(p.p.providerRef);
    return { payment: payDto((await markPaid(ctx, p.p.id))!, true) };
  });

  // Aviso do provedor (Mercado Pago chama esta URL)
  app.post('/webhooks/payments', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    try {
      const ev = await ctx.payments.parseWebhook({ headers: req.headers, body: req.body, query: req.query as Record<string, string> });
      if (ev?.status === 'paid') {
        const [p] = await ctx.db.select().from(payments).where(eq(payments.id, ev.paymentId));
        if (p) {
          if (p.method === 'card' && p.providerRef !== ev.providerRef) await ctx.db.update(payments).set({ providerRef: ev.providerRef }).where(eq(payments.id, p.id));
          await markPaid(ctx, p.id);
        }
      }
      return reply.status(200).send({ ok: true });
    } catch (err) {
      req.log.warn({ err }, 'webhook de pagamento rejeitado');
      return reply.status(400).send({ ok: false });
    }
  });
}
