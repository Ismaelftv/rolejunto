import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { availability, blocks, bookings, favorites, notifications, partnerProfiles, photos, reviews, timeOff, users } from '../db/schema.js';
import { config } from '../config.js';
import { notify } from '../lib/context.js';
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
/** A data (AAAA-MM-DD) está numa folga do parceiro? */
export async function offDates(db: DB, partnerId: string) {
  const rows = await db.select().from(timeOff).where(eq(timeOff.partnerId, partnerId));
  return (date: string) => rows.some((t) => t.startDate <= date && date <= t.endDate);
}

/** Tem pelo menos 1 foto aprovada (exigência para aparecer na busca). */
export const hasApprovedPhoto = sql`exists (select 1 from ${photos} ph where ph.partner_id = ${users.id} and ph.status = 'approved')`;

export async function agenda(db: DB, partnerId: string, minHours: number) {
  const slots = await db.select().from(availability).where(eq(availability.partnerId, partnerId));
  const isOff = await offDates(db, partnerId);
  const taken = await db.select().from(bookings).where(and(eq(bookings.partnerId, partnerId), inArray(bookings.status, [...ACTIVE_STATUSES])));
  return Array.from({ length: 7 }, (_, offset) => {
    const { iso, weekday } = localDay(offset);
    if (isOff(iso)) return { date: iso, offset, slots: [] as string[], off: true };
    const free = slots.filter((s) => s.weekday === weekday).map((s) => s.start).sort()
      .filter((start) => {
        const t = new Date(`${iso}T${start}:00${TZ}`).getTime();
        if (t < Date.now() + 60 * 60_000) return false; // pelo menos 1 h de antecedência
        const end = t + minHours * 3600_000;
        return !taken.some((b) => b.startsAt.getTime() < end && t < b.startsAt.getTime() + b.hours * 3600_000);
      });
    return { date: iso, offset, slots: free, off: false };
  });
}

/** O que falta para o parceiro aparecer na busca e no mapa. */
export async function searchChecklist(db: DB, u: { id: string; verification: string; emailVerifiedAt: Date | null }) {
  const [p] = await db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, u.id));
  const slots = await db.select({ w: availability.weekday }).from(availability).where(eq(availability.partnerId, u.id)).limit(1);
  const pics = await db.select({ status: photos.status }).from(photos).where(eq(photos.partnerId, u.id));
  const c = {
    emailVerified: !!u.emailVerifiedAt,
    identityVerified: u.verification === 'verified',
    hasLocation: p?.approxLat != null && p?.approxLng != null,
    hasActivities: (p?.activities.length ?? 0) > 0,
    hasAvailability: slots.length > 0,
    hasPhoto: !config.REQUIRE_PARTNER_PHOTO || pics.some((x) => x.status === 'approved'),
    visible: !!p?.visible,
  };
  return { ...c, photoPending: pics.some((x) => x.status === 'pending'), searchable: Object.values(c).every(Boolean) };
}

export default function partnerRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Primeira foto aprovada de cada parceiro (capa do card). */
  async function coverPhotos(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = await ctx.db.select({ partnerId: photos.partnerId, url: photos.url }).from(photos)
      .where(and(inArray(photos.partnerId, ids), eq(photos.status, 'approved'))).orderBy(photos.position, photos.createdAt);
    const m = new Map<string, string>();
    for (const r of rows) if (!m.has(r.partnerId)) m.set(r.partnerId, r.url);
    return m;
  }

  /** Avisa quem favoritou o parceiro que ele abriu horários (no máximo 1 aviso por dia por pessoa). */
  async function notifyFavorites(partnerId: string, partnerName: string) {
    const fans = await ctx.db.select({ userId: favorites.userId }).from(favorites).where(eq(favorites.partnerId, partnerId));
    if (!fans.length) return;
    const since = new Date(Date.now() - 24 * 3600_000);
    const recent = await ctx.db.select({ userId: notifications.userId, data: notifications.data }).from(notifications)
      .where(and(eq(notifications.type, 'favorite_available'), gte(notifications.createdAt, since), inArray(notifications.userId, fans.map((f) => f.userId))));
    const already = new Set(recent.filter((n) => (n.data as { partnerId?: string })?.partnerId === partnerId).map((n) => n.userId));
    for (const f of fans) if (!already.has(f.userId)) await notify(ctx.db, f.userId, 'favorite_available', { partnerId, partnerName: partnerName.split(' ')[0] }, `/parceiro/${partnerId}`);
  }

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
    if (config.REQUIRE_PARTNER_PHOTO) conds.push(hasApprovedPhoto);
    if (q.activity) conds.push(sql`${q.activity} = ANY(${partnerProfiles.activities})`);
    if (q.maxPriceCents) conds.push(lte(partnerProfiles.priceCents, q.maxPriceCents));
    if (q.q) conds.push(or(ilike(users.name, `%${q.q}%`), ilike(partnerProfiles.bio, `%${q.q}%`), ilike(partnerProfiles.neighborhood, `%${q.q}%`))!);
    if (q.when) {
      const days = q.when === 'today' ? [localDay(0).weekday] : q.when === 'tomorrow' ? [localDay(1).weekday] : [6, 0];
      conds.push(sql`exists (select 1 from ${availability} a where a.partner_id = ${users.id} and a.weekday in (${sql.join(days.map((d) => sql`${d}`), sql`, `)}))`);
    }
    const rows = await ctx.db.select({ u: users, p: partnerProfiles }).from(users).innerJoin(partnerProfiles, eq(partnerProfiles.userId, users.id)).where(and(...conds));
    const hidden = await blockedIds(ctx.db, req.user?.id);
    const covers = await coverPhotos(rows.map((r) => r.u.id));
    let list = rows.filter((r) => !hidden.has(r.u.id) && r.u.id !== req.user?.id).map((r) => {
      const km = distanceKm(lat, lng, r.p.approxLat!, r.p.approxLng!);
      return { km, card: dto.partnerCard(r.u, r.p, displayKm(km), ageFrom(r.u.birthDate), covers.get(r.u.id) ?? null) };
    }).filter((x) => x.km <= q.radiusKm);
    if (q.online) list = list.filter((x) => x.card.online);
    list.sort((a, b) => (q.sort === 'price' ? a.card.priceCents - b.card.priceCents : q.sort === 'rating' ? (b.card.rating ?? 0) - (a.card.rating ?? 0) : a.km - b.km));
    return { total: list.length, center: { lat, lng }, items: list.slice(q.offset, q.offset + q.limit).map((x) => x.card) };
  });

  // ---------- Perfil público ----------
  app.get<{ Params: { id: string } }>('/partners/:id', async (req) => {
    const id = parse(z.string().uuid(), req.params.id);
    const [row] = await ctx.db.select({ u: users, p: partnerProfiles }).from(users).innerJoin(partnerProfiles, eq(partnerProfiles.userId, users.id))
      .where(and(eq(users.id, id), eq(users.status, 'active'), eq(users.verification, 'verified'), eq(partnerProfiles.visible, true), ...(config.REQUIRE_PARTNER_PHOTO ? [hasApprovedPhoto] : [])));
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
        ...dto.partnerCard(row.u, row.p, displayKm(distanceKm(lat, lng, row.p.approxLat ?? lat, row.p.approxLng ?? lng)), ageFrom(row.u.birthDate), pics[0]?.url ?? null),
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
    if (b.visible && config.REQUIRE_PARTNER_PHOTO) {
      const pics = await ctx.db.select({ id: photos.id }).from(photos).where(and(eq(photos.partnerId, u.id), inArray(photos.status, ['approved', 'pending']))).limit(1);
      if (!pics.length) throw E.unprocessable('photo_required', 'Envie pelo menos uma foto sua para aparecer nas buscas.');
    }
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
    if (b.visible && current && !current.visible) await notifyFavorites(u.id, u.name); // voltou a aparecer
    return { profile: p, checklist: await searchChecklist(ctx.db, u) };
  });

  app.put('/partner/availability', async (req) => {
    const u = requireRole(req, 'partner');
    // horários exatos: qualquer hora cheia ou meia hora (ex.: 19:00, 19:30)
    const b = parse(z.object({ slots: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/) })).max(200) }), req.body);
    const before = await ctx.db.select().from(availability).where(eq(availability.partnerId, u.id));
    const had = new Set(before.map((x) => `${x.weekday}-${x.start}`));
    await ctx.db.delete(availability).where(eq(availability.partnerId, u.id));
    if (b.slots.length) await ctx.db.insert(availability).values(b.slots.map((s) => ({ partnerId: u.id, ...s }))).onConflictDoNothing();
    const added = b.slots.filter((x) => !had.has(`${x.weekday}-${x.start}`)).length;
    if (added > 0) await notifyFavorites(u.id, u.name); // abriu horários novos
    return { ok: true, count: b.slots.length, added };
  });

  // ---------- Folgas e férias ----------
  app.get('/partner/time-off', async (req) => {
    const u = requireRole(req, 'partner');
    const today = localDay(0).iso;
    const rows = await ctx.db.select().from(timeOff).where(and(eq(timeOff.partnerId, u.id), gte(timeOff.endDate, today))).orderBy(timeOff.startDate);
    return { items: rows.map((t) => ({ id: t.id, startDate: t.startDate, endDate: t.endDate, note: t.note })) };
  });

  app.post('/partner/time-off', async (req, reply) => {
    const u = requireRole(req, 'partner');
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const b = parse(z.object({ startDate: day, endDate: day, note: z.string().trim().max(120).default('') }), req.body);
    if (b.endDate < b.startDate) throw E.badRequest('invalid_dates', 'A data final precisa ser depois da inicial.');
    if (b.startDate < localDay(0).iso) throw E.badRequest('invalid_dates', 'Escolha datas a partir de hoje.');
    // Pedidos já aceitos nessas datas continuam valendo: o parceiro precisa cancelar um a um, para o cliente ser avisado e reembolsado.
    const [t] = await ctx.db.insert(timeOff).values({ partnerId: u.id, ...b }).returning();
    const startUtc = new Date(`${b.startDate}T00:00:00-03:00`);
    const endUtc = new Date(new Date(`${b.endDate}T00:00:00-03:00`).getTime() + 86400_000);
    const conflicts = await ctx.db.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.partnerId, u.id), inArray(bookings.status, ['requested', 'accepted']), gte(bookings.startsAt, startUtc), lte(bookings.startsAt, endUtc)));
    return reply.status(201).send({ timeOff: { id: t.id, startDate: t.startDate, endDate: t.endDate, note: t.note }, conflicts: conflicts.length });
  });

  app.delete<{ Params: { id: string } }>('/partner/time-off/:id', async (req) => {
    const u = requireRole(req, 'partner');
    const [t] = await ctx.db.delete(timeOff).where(and(eq(timeOff.id, parse(z.string().uuid(), req.params.id)), eq(timeOff.partnerId, u.id))).returning();
    if (!t) throw E.notFound();
    await notifyFavorites(u.id, u.name);
    return { ok: true };
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
