// Crescimento: cupons de desconto, "indique um amigo" e configuração pública do app.
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import type { DB } from '../db/index.js';
import { bookings, couponRedemptions, coupons, partnerProfiles, users } from '../db/schema.js';
import { audit, notify, parse, requireRole, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';

type Coupon = typeof coupons.$inferSelect;
const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = (n: number) => Array.from(randomBytes(n), (b) => SAFE[b % SAFE.length]).join('');
const MIN_CHARGE = 100; // o pagamento mínimo é R$ 1,00

export const couponDto = (c: Coupon) => ({
  id: c.id, code: c.code, kind: c.kind, value: c.value, maxDiscountCents: c.maxDiscountCents, minTotalCents: c.minTotalCents,
  maxUses: c.maxUses, usesCount: c.usesCount, perUser: c.perUser, personal: !!c.ownerId, source: c.source,
  validUntil: c.validUntil, active: c.active, createdAt: c.createdAt,
});

/** Valida o cupom para esta pessoa e este valor; devolve o desconto em centavos. */
export async function evaluateCoupon(db: DB, userId: string, code: string, totalCents: number) {
  const [c] = await db.select().from(coupons).where(sql`upper(${coupons.code}) = ${code.trim().toUpperCase()}`);
  if (!c || !c.active || (c.ownerId && c.ownerId !== userId)) throw E.unprocessable('coupon_invalid', 'Cupom inválido.');
  if (c.validUntil && c.validUntil < new Date()) throw E.unprocessable('coupon_expired', 'Este cupom expirou.');
  if (c.maxUses != null && c.usesCount >= c.maxUses) throw E.unprocessable('coupon_used_up', 'Este cupom já foi todo usado.');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(couponRedemptions).where(and(eq(couponRedemptions.couponId, c.id), eq(couponRedemptions.userId, userId)));
  if (n >= c.perUser) throw E.unprocessable('coupon_already_used', 'Você já usou este cupom.');
  if (totalCents < c.minTotalCents) throw E.unprocessable('coupon_min_total', `Válido para reservas a partir de R$ ${(c.minTotalCents / 100).toFixed(2)}.`, { minTotalCents: c.minTotalCents });
  let discount = c.kind === 'percent' ? Math.round((totalCents * c.value) / 100) : c.value;
  if (c.kind === 'percent' && c.maxDiscountCents) discount = Math.min(discount, c.maxDiscountCents);
  discount = Math.max(0, Math.min(discount, totalCents - MIN_CHARGE));
  return { coupon: c, discountCents: discount };
}

/** Registra o uso do cupom na reserva. */
export async function redeemCoupon(db: DB, couponId: string, userId: string, bookingId: string, discountCents: number) {
  await db.insert(couponRedemptions).values({ couponId, userId, bookingId, discountCents });
  await db.update(coupons).set({ usesCount: sql`${coupons.usesCount} + 1` }).where(eq(coupons.id, couponId));
}

/** Reserva recusada ou cancelada: o cupom volta a valer para a pessoa. */
export async function releaseCoupon(db: DB, bookingId: string) {
  const rows = await db.delete(couponRedemptions).where(eq(couponRedemptions.bookingId, bookingId)).returning();
  for (const r of rows) await db.update(coupons).set({ usesCount: sql`greatest(${coupons.usesCount} - 1, 0)` }).where(eq(coupons.id, r.couponId));
}

/** Código pessoal de indicação (criado na primeira vez que a pessoa abre a tela). */
export async function ensureReferralCode(db: DB, u: { id: string; name: string; referralCode: string | null }) {
  if (u.referralCode) return u.referralCode;
  const base = u.name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'ROLE';
  for (let i = 0; i < 6; i++) {
    const code = `${base}${randCode(4)}`;
    const [ok] = await db.update(users).set({ referralCode: code }).where(and(eq(users.id, u.id), isNull(users.referralCode))).returning({ code: users.referralCode }).catch(() => [] as { code: string | null }[]);
    if (ok?.code) return ok.code;
    const [again] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, u.id));
    if (again?.code) return again.code;
  }
  throw new Error('referral_code');
}

export async function findReferrer(db: DB, code?: string | null) {
  if (!code) return null;
  const [r] = await db.select({ id: users.id }).from(users).where(and(sql`upper(${users.referralCode}) = ${code.trim().toUpperCase()}`, eq(users.status, 'active')));
  return r?.id ?? null;
}

/** Primeiro encontro concluído de quem foi indicado: os dois ganham um cupom. */
export async function rewardReferral(db: DB, clientId: string) {
  if (!config.REFERRAL_REWARD_CENTS) return;
  const [client] = await db.select().from(users).where(eq(users.id, clientId));
  if (!client?.referredBy) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings).where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed')));
  if (n !== 1) return; // só no primeiro encontro
  const validUntil = new Date(Date.now() + 90 * 86400_000);
  for (const ownerId of [clientId, client.referredBy]) {
    await db.insert(coupons).values({
      code: `AMIGO-${randCode(6)}`, kind: 'fixed', value: config.REFERRAL_REWARD_CENTS, maxUses: 1, perUser: 1, ownerId, source: 'referral', validUntil,
    });
    await notify(db, ownerId, 'referral_reward', { amountCents: config.REFERRAL_REWARD_CENTS, friendName: ownerId === clientId ? '' : client.name.split(' ')[0] }, '/conta');
  }
}

export default function growthRoutes(app: FastifyInstance, ctx: Ctx) {
  // Configuração pública (o app mostra os botões de login social só se estiverem configurados)
  app.get('/public-config', async () => ({
    googleClientId: config.GOOGLE_CLIENT_ID ?? null,
    appleClientId: config.APPLE_CLIENT_ID ?? null,
    referralRewardCents: config.REFERRAL_REWARD_CENTS,
    requirePartnerPhoto: config.REQUIRE_PARTNER_PHOTO,
  }));

  // ---------- Indique um amigo ----------
  app.get('/me/referral', async (req) => {
    const u = requireUser(req);
    const code = await ensureReferralCode(ctx.db, u);
    const invited = await ctx.db.select({ id: users.id, status: users.status }).from(users).where(eq(users.referredBy, u.id));
    const [{ n: rewarded }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(coupons).where(and(eq(coupons.ownerId, u.id), eq(coupons.source, 'referral')));
    return { code, link: `${config.APP_URL.split(',')[0].replace(/\/$/, '')}/cadastro?ref=${code}`, invited: invited.length, rewards: rewarded, rewardCents: config.REFERRAL_REWARD_CENTS };
  });

  // ---------- Cupons da pessoa ----------
  app.get('/me/coupons', async (req) => {
    const u = requireUser(req);
    const rows = await ctx.db.select().from(coupons).where(and(eq(coupons.ownerId, u.id), eq(coupons.active, true), or(isNull(coupons.validUntil), gt(coupons.validUntil, new Date()))!)).orderBy(desc(coupons.createdAt));
    const used = rows.length ? await ctx.db.select({ couponId: couponRedemptions.couponId }).from(couponRedemptions).where(and(eq(couponRedemptions.userId, u.id), inArray(couponRedemptions.couponId, rows.map((c) => c.id)))) : [];
    const usedSet = new Set(used.map((x) => x.couponId));
    return { items: rows.filter((c) => !usedSet.has(c.id) && (c.maxUses == null || c.usesCount < c.maxUses)).map(couponDto) };
  });

  // Prévia do desconto no checkout
  app.post('/coupons/check', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ code: z.string().trim().min(3).max(40), partnerId: z.string().uuid(), hours: z.number().int().min(1).max(12) }), req.body);
    const [p] = await ctx.db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, b.partnerId));
    if (!p) throw E.notFound('partner_not_found');
    const subtotal = p.priceCents * b.hours;
    const fee = Math.round(subtotal * config.SERVICE_FEE_RATE);
    const { coupon, discountCents } = await evaluateCoupon(ctx.db, u.id, b.code, subtotal + fee);
    return { code: coupon.code, discountCents, subtotalCents: subtotal, feeCents: fee, totalCents: subtotal + fee - discountCents };
  });

  // ---------- Admin: campanhas ----------
  app.get('/admin/coupons', async (req) => {
    requireRole(req, 'admin');
    const rows = await ctx.db.select().from(coupons).where(isNull(coupons.ownerId)).orderBy(desc(coupons.createdAt)).limit(200);
    const [{ n, total }] = await ctx.db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${couponRedemptions.discountCents}), 0)::int` }).from(couponRedemptions);
    const [{ refs }] = await ctx.db.select({ refs: sql<number>`count(*)::int` }).from(coupons).where(eq(coupons.source, 'referral'));
    return { items: rows.map(couponDto), stats: { redemptions: n, discountCents: total, referralCoupons: refs } };
  });

  app.post('/admin/coupons', async (req, reply) => {
    const a = requireRole(req, 'admin');
    const b = parse(z.object({
      code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/),
      kind: z.enum(['percent', 'fixed']),
      value: z.number().int().positive(),
      maxDiscountCents: z.number().int().positive().nullable().optional(),
      minTotalCents: z.number().int().min(0).default(0),
      maxUses: z.number().int().positive().nullable().optional(),
      perUser: z.number().int().min(1).max(20).default(1),
      validUntil: z.string().datetime({ offset: true }).nullable().optional(),
    }), req.body);
    if (b.kind === 'percent' && b.value > 100) throw E.badRequest('validation', 'Porcentagem até 100.');
    const [dup] = await ctx.db.select({ id: coupons.id }).from(coupons).where(sql`upper(${coupons.code}) = ${b.code.toUpperCase()}`);
    if (dup) throw E.conflict('coupon_exists', 'Já existe um cupom com esse código.');
    const [c] = await ctx.db.insert(coupons).values({ ...b, code: b.code.toUpperCase(), validUntil: b.validUntil ? new Date(b.validUntil) : null, createdBy: a.id }).returning();
    await audit(ctx.db, req, 'coupon.create', 'coupon', c.id, { code: c.code });
    return reply.status(201).send({ coupon: couponDto(c) });
  });

  app.post<{ Params: { id: string } }>('/admin/coupons/:id/toggle', async (req) => {
    requireRole(req, 'admin');
    const [c] = await ctx.db.update(coupons).set({ active: sql`not ${coupons.active}` }).where(eq(coupons.id, parse(z.string().uuid(), req.params.id))).returning();
    if (!c) throw E.notFound();
    await audit(ctx.db, req, c.active ? 'coupon.activate' : 'coupon.deactivate', 'coupon', c.id);
    return { coupon: couponDto(c) };
  });
}
