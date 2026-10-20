import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { availability, blocks, bookings, favorites, partnerProfiles, photos, reviews, users } from '../db/schema.js';
import { parse, requireRole, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { approx, bbox, displayKm, distanceKm } from '../lib/geo.js';
import { moderateText } from '../lib/moderation.js';
import { cityCenter } from '../lib/cities.js';
import { ageFrom } from '../lib/security.js';
import { imageExt } from '../providers/storage.js';
import { ACTIVE_STATUSES, hadCompletedPublicMeeting, participants } from './bookingService.js';

/** "Ana Paula Souza" → "Ana S." (privacidade entre as partes). */
export const shortName = (n?: string) => { const [a, ...r] = (n ?? '').trim().split(/\s+/); return r.length ? `${a} ${r[r.length - 1][0]}.` : a ?? ''; };
import * as dto from './dto.js';

export const ACTIVITIES = ['balada', 'bar', 'praia', 'casa', 'sitio', 'show', 'jantar', 'museu', 'turismo', 'evento', 'cuidado'] as const;
export const PRIVATE_ACTIVITIES = new Set(['casa', 'sitio']);
export const TZ = '-03:00'; // horário de Brasília
const DEFAULT_LOC = { lat: -23.566, lng: -46.692 }; // Pinheiros, São Paulo

/** Data local (AAAA-MM-DD) e dia da semana em Brasília, daqui a N dias. */
export function localDay(offset: number) {
  const d = new Date(Date.now() - 3 * 3600_000 + offset * 86400_000);
  return { iso: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

export async function blockedIds(db: DB, userId?: string) {
  if (!userId) return new Set<string>();
  const rows = await db.select().from(blocks).where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

/** Próximos 7 dias de horários livres (descontando reservas e horários que já passaram). */
export async function agenda(db: DB, partnerId: string, minHours: number) {
  const slots = await db.select().from(availability).where(eq(availability.partnerId, partnerId));
  const taken = await db.select().from(bookings).where(and(eq(bookings.partnerId, partnerId), inArray(bookings.status, [...ACTIVE_STATUSES])));
  return Array.from({ length: 7 }, (_, offset) => {
    const { iso, weekday } = localDay(offset);
    const free = slots.filter((s) => s.weekday === weekday).map((s) => s.start).sort()
      .filter((start) => {
        const t = new Date(`${iso}T${start}:00${TZ}`).getTime();
        if (t < Date.now() + 60 * 60_000) return false; // pelo menos 1 h de antecedência
        const end = t + minHours * 3600_000;
        return !taken.some((b) => b.startsAt.getTime() < end && t < b.startsAt.getTime() + b.hours * 3600_000);
      });
    return { date: iso, offset, slots: free };
  });
}

/** O que falta para o parceiro aparecer na busca e no mapa. */
export async function searchChecklist(db: DB, u: { id: string; verification: string; emailVerifiedAt: Date | null }) {
  const [p] = await db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, u.id));
  const slots = await db.select({ w: availability.weekday }).from(availability).where(eq(availability.partnerId, u.id)).limit(1);
  const c = {
    emailVerified: !!u.emailVerifiedAt,
    identityVerified: u.verification === 'verified',
    hasLocation: p?.approxLat != null && p?.approxLng != null,
    hasActivities: (p?.activities.length ?? 0) > 0,
    hasAvailability: slots.length > 0,
    visible: !!p?.visible,
  };
  return { ...c, searchable: Object.values(c).every(Boolean) };
}

export default function partnerRoutes(app: FastifyInstance, ctx: Ctx) {
  // ---------- Busca ----------
  app.get('/partners', async (req) => {
    const q = parse(z.object({
      activity: z.enum(ACTIVITIES).optional(),
      when: z.enum(['today', 'tomorrow', 'weekend']).optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().min(1).max(50).default(10),
      maxPriceCents: z.coerce.number().int().positive().optional(),
      online: z.coerce.boolean().optional(),
      q: z.string().trim().max(60).optional(),
      city: z.string().trim().max(80).optional(), // sem lat/lng: centro da cidade da pessoa
      sort: z.enum(['distance', 'price', 'rating']).default('distance'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }), req.query);
    const center = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : cityCenter(q.city) ?? DEFAULT_LOC;
    const { lat, lng } = center;
    const box = bbox(lat, lng, q.radiusKm);
    const conds = [
      eq(users.status, 'active'), eq(users.role, 'partner'), eq(users.verification, 'verified'), eq(partnerProfiles.visible, true),
      gte(partnerProfiles.approxLat, box.minLat), lte(partnerProfiles.approxLat, box.maxLat),
      gte(partnerProfiles.approxLng, box.minLng), lte(partnerProfiles.approxLng, box.maxLng),
    ];
    if (q.activity) conds.push(sql`${q.activity} = ANY(${partnerProfiles.activities})`);
    if (q.maxPriceCents) conds.push(lte(partnerProfiles.priceCents, q.maxPriceCents));
    if (q.q) conds.push(or(ilike(users.name, `%${q.q}%`), ilike(partnerProfiles.bio, `%${q.q}%`), ilike(partnerProfiles.neighborhood, `%${q.q}%`))!);
    if (q.when) {
      const days = q.when === 'today' ? [localDay(0).weekday] : q.when === 'tomorrow' ? [localDay(1).weekday] : [6, 0];
      conds.push(sql`exists (select 1 from ${availability} a where a.partner_id = ${users.id} and a.weekday in (${sql.join(days.map((d) => sql`${d}`), sql`, `)}))`);
    }
    const rows = await ctx.db.select({ u: users, p: partnerProfiles }).from(users).innerJoin(partnerProfiles, eq(partnerProfiles.userId, users.id)).where(and(...conds));
    const hidden = await blockedIds(ctx.db, req.user?.id);
    let list = rows.filter((r) => !hidden.has(r.u.id) && r.u.id !== req.user?.id).map((r) => {
      const km = distanceKm(lat, lng, r.p.approxLat!, r.p.approxLng!);
      return { km, card: dto.partnerCard(r.u, r.p, displayKm(km), ageFrom(r.u.birthDate)) };
    }).filter((x) => x.km <= q.radiusKm);
    if (q.online) list = list.filter((x) => x.card.online);
    list.sort((a, b) => (q.sort === 'price' ? a.card.priceCents - b.card.priceCents : q.sort === 'rating' ? (b.card.rating ?? 0) - (a.card.rating ?? 0) : a.km - b.km));
    return { total: list.length, items: list.slice(q.offset, q.offset + q.limit).map((x) => x.card) };
  });

  // ---------- Perfil público ----------
  app.get<{ Params: { id: string } }>('/partners/:id', async (req) => {
    const id = parse(z.string().uuid(), req.params.id);
    const [row] = await ctx.db.select({ u: users, p: partnerProfiles }).from(users).innerJoin(partnerProfiles, eq(partnerProfiles.userId, users.id))
      .where(and(eq(users.id, id), eq(users.status, 'active'), eq(users.verification, 'verified'), eq(partnerProfiles.visible, true)));
    if (!row || (await blockedIds(ctx.db, req.user?.id)).has(id)) throw E.notFound('partner_not_found');
    const lat = Number((req.query as { lat?: string }).lat ?? DEFAULT_LOC.lat);
    const lng = Number((req.query as { lng?: string }).lng ?? DEFAULT_LOC.lng);
    const [pics, revs, days] = await Promise.all([
      ctx.db.select({ id: photos.id, url: photos.url }).from(photos).where(and(eq(photos.partnerId, id), eq(photos.status, 'approved'))).orderBy(photos.position),
      ctx.db.select({ r: reviews, author: users.name, activity: bookings.activity }).from(reviews).innerJoin(users, eq(users.id, reviews.authorId)).innerJoin(bookings, eq(bookings.id, reviews.bookingId))
        .where(and(eq(reviews.targetId, id), eq(reviews.hidden, false))).orderBy(desc(reviews.createdAt)).limit(20),
      agenda(ctx.db, id, row.p.minHours),
    ]);
    const viewer = req.user;
    const [fav] = viewer ? await ctx.db.select().from(favorites).where(and(eq(favorites.userId, viewer.id), eq(favorites.partnerId, id))) : [];
    return {
      partner: {
        ...dto.partnerCard(row.u, row.p, displayKm(distanceKm(lat, lng, row.p.approxLat ?? lat, row.p.approxLng ?? lng)), ageFrom(row.u.birthDate)),
        about: row.p.about, photos: pics,
        reviews: revs.map((x) => ({ id: x.r.id, author: shortName(x.author), activity: x.activity, rating: x.r.rating, text: x.r.text, createdAt: x.r.createdAt })),
        agenda: days,
      },
      viewer: viewer ? { isFavorite: !!fav, canBookPrivate: await hadCompletedPublicMeeting(ctx.db, viewer.id, id) } : null,
    };
  });

  // ---------- Área do parceiro ----------
  app.get('/partner/profile', async (req) => {
    const u = requireRole(req, 'partner');
    const [p] = await ctx.db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, u.id));
    const [slots, pics] = await Promise.all([
      ctx.db.select({ weekday: availability.weekday, start: availability.start }).from(availability).where(eq(availability.partnerId, u.id)),
      ctx.db.select().from(photos).where(eq(photos.partnerId, u.id)).orderBy(photos.position),
    ]);
    return { profile: p ?? null, availability: slots, photos: pics, checklist: await searchChecklist(ctx.db, u) };
  });

  app.put('/partner/profile', async (req) => {
    const u = requireRole(req, 'partner');
    // Atualização parcial: envie só o que mudou.
    const b = parse(z.object({
      bio: z.string().trim().max(140), about: z.string().trim().max(1000),
      translations: z.partialRecord(z.enum(['pt', 'es', 'en', 'zh']), z.object({ bio: z.string().trim().max(140).optional(), about: z.string().trim().max(1000).optional() })),
      priceCents: z.number().int().min(3000).max(100000), minHours: z.number().int().min(1).max(8),
      languages: z.array(z.string().trim().max(20)).max(8), activities: z.array(z.enum(ACTIVITIES)).min(1).max(11),
      neighborhood: z.string().trim().max(80), city: z.string().trim().max(80),
      lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
      visible: z.boolean(),
    }).partial(), req.body);
    const texts = [b.bio, b.about, ...Object.values(b.translations ?? {}).flatMap((t) => [t.bio, t.about])].filter((t): t is string => !!t);
    for (const text of texts) {
      const m = moderateText(text);
      if (!m.ok) throw E.unprocessable(m.code, m.code === 'contact_info' ? 'Não inclua contatos no perfil.' : 'Conteúdo não permitido no RolêJunto.');
    }
    if (b.visible && u.verification !== 'verified') throw E.forbidden('verification_required', 'Verifique sua identidade antes de aparecer nas buscas.');
    if (b.visible && !u.emailVerifiedAt) throw E.forbidden('email_unverified', 'Confirme seu e-mail antes de aparecer nas buscas.');
    const [current] = await ctx.db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, u.id));
    let { lat, lng } = b;
    // Sem a localização do aparelho: usa o centro da cidade informada (se ainda não houver localização)
    if ((lat === undefined || lng === undefined) && b.city && current?.approxLat == null) {
      const c = cityCenter(b.city);
      if (c) { lat = c.lat; lng = c.lng; }
    }
    const hasLocation = (lat !== undefined && lng !== undefined) || (current?.approxLat != null && current?.approxLng != null);
    if (b.visible && !hasLocation) throw E.unprocessable('location_required', 'Defina sua região (cidade ou localização) para aparecer nas buscas.');
    const { lat: _lat, lng: _lng, ...rest } = b;
    // Texto novo sem traduções: as versões antigas em outros idiomas deixam de valer (o app mostra o texto original)
    if ((b.bio !== undefined || b.about !== undefined) && b.translations === undefined) rest.translations = {};
    const values = {
      ...rest,
      ...(lat !== undefined && lng !== undefined ? { approxLat: approx(lat), approxLng: approx(lng) } : {}),
      updatedAt: new Date(),
    };
    const [p] = await ctx.db.insert(partnerProfiles).values({ userId: u.id, ...values })
      .onConflictDoUpdate({ target: partnerProfiles.userId, set: values }).returning();
    return { profile: p, checklist: await searchChecklist(ctx.db, u) };
  });

  app.put('/partner/availability', async (req) => {
    const u = requireRole(req, 'partner');
    const b = parse(z.object({ slots: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).max(100) }), req.body);
    await ctx.db.delete(availability).where(eq(availability.partnerId, u.id));
    if (b.slots.length) await ctx.db.insert(availability).values(b.slots.map((s) => ({ partnerId: u.id, ...s }))).onConflictDoNothing();
    return { ok: true, count: b.slots.length };
  });

  app.post('/partner/photos', async (req) => {
    const u = requireRole(req, 'partner');
    const file = await req.file();
    if (!file) throw E.badRequest('file_required');
    const buf = await file.toBuffer();
    const ext = imageExt(buf);
    if (!ext) throw E.badRequest('invalid_image', 'Envie uma imagem JPG, PNG ou WEBP.');
    const count = (await ctx.db.select({ id: photos.id }).from(photos).where(eq(photos.partnerId, u.id))).length;
    if (count >= 8) throw E.unprocessable('too_many_photos', 'Máximo de 8 fotos.');
    const url = await ctx.storage.save(buf, ext);
    const [ph] = await ctx.db.insert(photos).values({ partnerId: u.id, url, position: count }).returning(); // entra como "pending" (moderação)
    return { photo: ph };
  });

  app.delete<{ Params: { id: string } }>('/partner/photos/:id', async (req) => {
    const u = requireRole(req, 'partner');
    const [ph] = await ctx.db.delete(photos).where(and(eq(photos.id, req.params.id), eq(photos.partnerId, u.id))).returning();
    if (!ph) throw E.notFound();
    await ctx.storage.remove(ph.url);
    return { ok: true };
  });

  app.get('/partner/earnings', async (req) => {
    const u = requireRole(req, 'partner');
    const rows = await ctx.db.select().from(bookings).where(eq(bookings.partnerId, u.id)).orderBy(desc(bookings.startsAt));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const released = rows.filter((b) => b.paymentStatus === 'released');
    const people = await participants(ctx.db, [...new Set(released.slice(0, 50).map((b) => b.clientId))]);
    return {
      // O parceiro recebe o valor integral da hora; a taxa de serviço é paga pelo cliente.
      availableCents: released.filter((b) => !b.payoutId).reduce((s, b) => s + b.subtotalCents, 0), // liberado e ainda não repassado
      paidOutCents: released.filter((b) => b.payoutId).reduce((s, b) => s + b.subtotalCents, 0),
      pendingCents: rows.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.subtotalCents, 0),
      monthCents: released.filter((b) => (b.completedAt ?? b.startsAt) >= monthStart).reduce((s, b) => s + b.subtotalCents, 0),
      history: released.slice(0, 50).map((b) => ({ bookingId: b.id, date: b.startsAt, clientName: shortName(people.get(b.clientId)?.name), activity: b.activity, hours: b.hours, amountCents: b.subtotalCents, paidOut: !!b.payoutId })),
    };
  });
}
