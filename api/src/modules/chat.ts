import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { conversations, messages, reports, users } from '../db/schema.js';
import { audit, notify, parse, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { moderateText } from '../lib/moderation.js';
import { getOrCreateConversation, participants } from './bookingService.js';
import { blockedIds } from './partners.js';

const msgDto = (m: typeof messages.$inferSelect, me: string) => ({
  id: m.id, kind: m.kind, from: m.senderId === null ? 'system' : m.senderId === me ? 'me' : 'them',
  body: m.body, data: m.data, createdAt: m.createdAt, readAt: m.readAt,
});

export default function chatRoutes(app: FastifyInstance, ctx: Ctx) {
  async function loadConv(userId: string, id: string) {
    const [c] = await ctx.db.select().from(conversations).where(eq(conversations.id, parse(z.string().uuid(), id)));
    if (!c || (c.clientId !== userId && c.partnerId !== userId)) throw E.notFound('conversation_not_found');
    return c;
  }

  app.get('/conversations', async (req) => {
    const u = requireUser(req);
    const convs = await ctx.db.select().from(conversations).where(or(eq(conversations.clientId, u.id), eq(conversations.partnerId, u.id))).orderBy(desc(conversations.lastMessageAt)).limit(100);
    const blocked = await blockedIds(ctx.db, u.id);
    const visible = convs.filter((c) => !blocked.has(c.clientId === u.id ? c.partnerId : c.clientId));
    const people = await participants(ctx.db, visible.map((c) => (c.clientId === u.id ? c.partnerId : c.clientId)));
    const items = [];
    for (const c of visible) {
      const [last] = await ctx.db.select().from(messages).where(and(eq(messages.conversationId, c.id), eq(messages.hidden, false))).orderBy(desc(messages.createdAt)).limit(1);
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(messages)
        .where(and(eq(messages.conversationId, c.id), eq(messages.hidden, false), isNull(messages.readAt), ne(messages.senderId, u.id)));
      items.push({ id: c.id, other: people.get(c.clientId === u.id ? c.partnerId : c.clientId) ?? null, lastMessage: last ? msgDto(last, u.id) : null, unread: n });
    }
    return { items };
  });

  // O cliente pode iniciar uma conversa com um parceiro
  app.post('/conversations', async (req) => {
    const u = requireUser(req);
    const { partnerId } = parse(z.object({ partnerId: z.string().uuid() }), req.body);
    const [p] = await ctx.db.select().from(users).where(and(eq(users.id, partnerId), eq(users.role, 'partner'), eq(users.status, 'active')));
    if (!p || (await blockedIds(ctx.db, u.id)).has(partnerId)) throw E.notFound('partner_not_found');
    const c = await getOrCreateConversation(ctx.db, u.id, partnerId);
    return { conversation: { id: c.id } };
  });

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', async (req) => {
    const u = requireUser(req);
    const c = await loadConv(u.id, req.params.id);
    const { before } = parse(z.object({ before: z.string().datetime().optional() }), req.query);
    const rows = await ctx.db.select().from(messages)
      .where(and(eq(messages.conversationId, c.id), eq(messages.hidden, false), before ? lt(messages.createdAt, new Date(before)) : undefined))
      .orderBy(desc(messages.createdAt)).limit(50);
    await ctx.db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.conversationId, c.id), isNull(messages.readAt), ne(messages.senderId, u.id)));
    return { items: rows.reverse().map((m) => msgDto(m, u.id)) };
  });

  app.post<{ Params: { id: string } }>('/conversations/:id/messages', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = requireUser(req);
    const c = await loadConv(u.id, req.params.id);
    const other = c.clientId === u.id ? c.partnerId : c.clientId;
    if ((await blockedIds(ctx.db, u.id)).has(other)) throw E.forbidden('blocked');
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    const m = moderateText(body);
    if (!m.ok && m.code === 'contact_info') {
      throw E.unprocessable('contact_info', 'Por segurança, não compartilhe telefone, e-mail ou links antes do encontro.');
    }
    if (!m.ok) {
      // Pedido/oferta de serviço sexual: a mensagem não é entregue e vira denúncia de prioridade máxima
      await ctx.db.insert(messages).values({ conversationId: c.id, senderId: u.id, body, hidden: true });
      await ctx.db.insert(reports).values({ reporterId: null, targetId: u.id, reason: 'sexual', details: `Mensagem retida: ${body}`, priority: 'high' });
      await audit(ctx.db, req, 'moderation.message_held', 'user', u.id);
      throw E.unprocessable('policy_violation', 'Mensagem não enviada: o RolêJunto é exclusivamente social.');
    }
    const [created] = await ctx.db.insert(messages).values({ conversationId: c.id, senderId: u.id, body }).returning();
    await ctx.db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, c.id));
    await notify(ctx.db, other, 'new_message', { conversationId: c.id, fromName: u.name.split(' ')[0] }, `/mensagens/${c.id}`);
    return reply.status(201).send({ message: msgDto(created, u.id) });
  });
}
