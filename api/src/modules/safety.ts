import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { blocks, reports, users } from '../db/schema.js';
import { audit, notify, parse, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { HIGH_PRIORITY_REASONS, REPORT_REASONS } from '../lib/moderation.js';
import { participants } from './bookingService.js';

export default function safetyRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/reports', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = requireUser(req);
    const b = parse(z.object({
      targetId: z.string().uuid(), reason: z.enum(REPORT_REASONS), details: z.string().trim().max(2000).default(''), block: z.boolean().default(false),
    }), req.body);
    if (b.targetId === u.id) throw E.badRequest('self_report');
    const [t] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, b.targetId));
    if (!t) throw E.notFound();
    const priority = HIGH_PRIORITY_REASONS.has(b.reason) ? 'high' : 'medium';
    const [r] = await ctx.db.insert(reports).values({ reporterId: u.id, targetId: b.targetId, reason: b.reason, details: b.details, priority }).returning();
    if (b.block) await ctx.db.insert(blocks).values({ blockerId: u.id, blockedId: b.targetId }).onConflictDoNothing();
    if (priority === 'high') {
      const admins = await ctx.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
      for (const a of admins) await notify(ctx.db, a.id, 'urgent_report', { reportId: r.id, reason: b.reason }, '/admin');
    }
    await audit(ctx.db, req, 'report.create', 'user', b.targetId, { reason: b.reason });
    return reply.status(201).send({ report: { id: r.id, priority } });
  });

  app.get('/blocks', async (req) => {
    const u = requireUser(req);
    const rows = await ctx.db.select().from(blocks).where(eq(blocks.blockerId, u.id));
    const people = await participants(ctx.db, rows.map((r) => r.blockedId));
    return { items: rows.map((r) => ({ userId: r.blockedId, name: people.get(r.blockedId)?.name ?? '', createdAt: r.createdAt })) };
  });

  app.post('/blocks', async (req) => {
    const u = requireUser(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
    if (userId === u.id) throw E.badRequest('self_block');
    await ctx.db.insert(blocks).values({ blockerId: u.id, blockedId: userId }).onConflictDoNothing();
    return { ok: true };
  });

  app.delete<{ Params: { userId: string } }>('/blocks/:userId', async (req) => {
    const u = requireUser(req);
    await ctx.db.delete(blocks).where(and(eq(blocks.blockerId, u.id), eq(blocks.blockedId, req.params.userId)));
    return { ok: true };
  });
}
