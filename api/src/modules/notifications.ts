import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { notifications, users } from '../db/schema.js';
import { requireUser, type Ctx } from '../lib/context.js';

export default function notificationRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/notifications', async (req) => {
    const u = requireUser(req);
    const rows = await ctx.db.select().from(notifications).where(eq(notifications.userId, u.id)).orderBy(desc(notifications.createdAt)).limit(100);
    const items = rows.map((n) => ({ id: n.id, type: n.type, data: n.data, link: n.link, createdAt: n.createdAt, unread: n.createdAt > u.notifSeenAt }));
    return { items, unread: items.filter((i) => i.unread).length };
  });

  app.post('/notifications/seen', async (req) => {
    const u = requireUser(req);
    await ctx.db.update(users).set({ notifSeenAt: new Date() }).where(eq(users.id, u.id));
    return { ok: true };
  });
}
