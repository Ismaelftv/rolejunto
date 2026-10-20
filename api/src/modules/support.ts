import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supportTickets } from '../db/schema.js';
import { parse, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { renderEmail } from '../lib/emails.js';

export default function supportRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/support', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = parse(z.object({
      subject: z.enum(['booking_payment', 'safety', 'account', 'other']),
      message: z.string().trim().min(5).max(4000),
      email: z.string().trim().email().max(200).optional(),
      lang: z.enum(['pt', 'es', 'en', 'zh']).optional(),
    }), req.body);
    const email = req.user?.email ?? b.email;
    if (!email) throw E.badRequest('email_required', 'Informe um e-mail para resposta.');
    const [t] = await ctx.db.insert(supportTickets).values({ userId: req.user?.id ?? null, email, subject: b.subject, message: b.message }).returning();
    await ctx.mailer.send(email, renderEmail('support_received', req.user?.lang ?? b.lang, { protocol: t.id.slice(0, 8).toUpperCase() }));
    return reply.status(201).send({ ticket: { id: t.id, protocol: t.id.slice(0, 8).toUpperCase() } });
  });
}
