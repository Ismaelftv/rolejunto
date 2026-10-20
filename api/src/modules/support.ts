import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { bookings, supportTickets } from '../db/schema.js';
import { parse, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { renderEmail } from '../lib/emails.js';

export default function supportRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/support', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = parse(z.object({
      subject: z.enum(['booking_payment', 'safety', 'account', 'other']),
      message: z.string().trim().min(5).max(4000),
      email: z.string().trim().email().max(200).optional(),
      lang: z.enum(['pt', 'es', 'en', 'zh']).optional(),
      bookingId: z.string().uuid().optional(), // problema numa reserva específica
    }), req.body);
    const email = req.user?.email ?? b.email;
    if (!email) throw E.badRequest('email_required', 'Informe um e-mail para resposta.');
    let bookingId: string | null = null;
    if (b.bookingId && req.user) {
      const [bk] = await ctx.db.select({ c: bookings.clientId, p: bookings.partnerId }).from(bookings).where(eq(bookings.id, b.bookingId));
      if (bk && (bk.c === req.user.id || bk.p === req.user.id)) bookingId = b.bookingId; // só vincula reservas da própria pessoa
    }
    const [t] = await ctx.db.insert(supportTickets).values({ userId: req.user?.id ?? null, email, subject: b.subject, message: b.message, bookingId }).returning();
    await ctx.mailer.send(email, renderEmail('support_received', req.user?.lang ?? b.lang, { protocol: t.id.slice(0, 8).toUpperCase() }));
    return reply.status(201).send({ ticket: { id: t.id, protocol: t.id.slice(0, 8).toUpperCase() } });
  });

  // Meus chamados (com a resposta da equipe)
  app.get('/me/tickets', async (req) => {
    const u = requireUser(req);
    const rows = await ctx.db.select().from(supportTickets).where(eq(supportTickets.userId, u.id)).orderBy(desc(supportTickets.createdAt)).limit(50);
    return { items: rows.map((t) => ({ id: t.id, protocol: t.id.slice(0, 8).toUpperCase(), subject: t.subject, message: t.message, status: t.status, bookingId: t.bookingId, reply: t.reply, repliedAt: t.repliedAt, createdAt: t.createdAt })) };
  });
}
