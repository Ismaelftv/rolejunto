// Regras de negócio compartilhadas entre reservas, pagamentos, conta e admin.
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { config } from '../config.js';
import type { DB } from '../db/index.js';
import { bookings, conversations, messages, partnerProfiles, payments, reviews, users } from '../db/schema.js';
import { notify, type Ctx } from '../lib/context.js';

type Booking = typeof bookings.$inferSelect;

export async function getOrCreateConversation(db: DB, clientId: string, partnerId: string) {
  const [c] = await db.select().from(conversations).where(and(eq(conversations.clientId, clientId), eq(conversations.partnerId, partnerId)));
  if (c) return c;
  const [created] = await db.insert(conversations).values({ clientId, partnerId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(conversations).where(and(eq(conversations.clientId, clientId), eq(conversations.partnerId, partnerId)));
  return again;
}

/** Mensagem automática no chat (o app traduz pelo código). */
export async function systemMessage(db: DB, b: Pick<Booking, 'clientId' | 'partnerId'>, code: string, data: Record<string, unknown> = {}) {
  const conv = await getOrCreateConversation(db, b.clientId, b.partnerId);
  await db.insert(messages).values({ conversationId: conv.id, senderId: null, kind: 'system', body: code, data });
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
}

/** Casa/Sítio só depois de um encontro concluído em local público com a mesma pessoa. */
export async function hadCompletedPublicMeeting(db: DB, clientId: string, partnerId: string) {
  const rows = await db.select({ id: bookings.id }).from(bookings).where(and(
    eq(bookings.clientId, clientId), eq(bookings.partnerId, partnerId), eq(bookings.status, 'completed'), eq(bookings.privateVenue, false),
  )).limit(1);
  return rows.length > 0;
}

/** Reservas que ocupam a agenda do parceiro. */
export const ACTIVE_STATUSES = ['requested', 'accepted', 'in_progress'] as const;

export async function hasConflict(db: DB, partnerId: string, startsAt: Date, hours: number, ignoreId?: string) {
  const end = startsAt.getTime() + hours * 3600_000;
  const rows = await db.select().from(bookings).where(and(eq(bookings.partnerId, partnerId), inArray(bookings.status, [...ACTIVE_STATUSES])));
  return rows.some((b) => b.id !== ignoreId && b.startsAt.getTime() < end && startsAt.getTime() < b.startsAt.getTime() + b.hours * 3600_000);
}

/** Cancela e calcula o reembolso: integral se faltar mais de 24 h ou se quem cancela é o parceiro. */
export async function cancelBooking(ctx: Ctx, b: Booking, actorId: string, opts: { forceFullRefund?: boolean } = {}) {
  let paymentStatus = b.paymentStatus;
  if (b.paymentStatus === 'paid') {
    const [pay] = await ctx.db.select().from(payments).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'paid'))).orderBy(desc(payments.createdAt)).limit(1);
    const early = b.startsAt.getTime() - Date.now() > 24 * 3600_000;
    const full = opts.forceFullRefund || actorId === b.partnerId || early;
    const refund = full ? b.totalCents : Math.round(b.totalCents * config.LATE_CANCEL_REFUND_RATE);
    if (pay?.providerRef && refund > 0) await ctx.payments.refund({ providerRef: pay.providerRef, amountCents: refund });
    if (pay) await ctx.db.update(payments).set({ refundedCents: refund, status: full ? 'refunded' : 'partially_refunded' }).where(eq(payments.id, pay.id));
    paymentStatus = full ? 'refunded' : 'partially_refunded';
  }
  const [updated] = await ctx.db.update(bookings).set({ status: 'cancelled', paymentStatus, cancelledBy: actorId, cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, b.id)).returning();
  const other = actorId === b.clientId ? b.partnerId : b.clientId;
  await notify(ctx.db, other, 'booking_cancelled', { bookingId: b.id }, `/reservas/${b.id}`);
  await systemMessage(ctx.db, b, 'booking_cancelled', { bookingId: b.id });
  return updated;
}

export async function userName(db: DB, id: string) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  return u?.name ?? '';
}

export async function participants(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; name: string; avatarUrl: string | null; role: 'client' | 'partner' | 'admin' }>();
  const rows = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, role: users.role }).from(users).where(or(...ids.map((id) => eq(users.id, id))));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Recalcula a nota média do parceiro (só avaliações visíveis). */
export async function recomputeRating(db: DB, partnerId: string) {
  const all = await db.select({ rating: reviews.rating }).from(reviews).where(and(eq(reviews.targetId, partnerId), eq(reviews.hidden, false)));
  const avg = all.length ? Math.round((all.reduce((s, x) => s + x.rating, 0) / all.length) * 10) / 10 : null;
  await db.update(partnerProfiles).set({ ratingAvg: avg, ratingCount: all.length }).where(eq(partnerProfiles.userId, partnerId));
}
