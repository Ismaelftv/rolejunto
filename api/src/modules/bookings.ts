import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { config, isProd } from '../config.js';
import { availability, bookings, partnerProfiles, reports, reviews, users } from '../db/schema.js';
import { audit, notify, parse, requireUser, requireVerified, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { moderateText } from '../lib/moderation.js';
import { cancelBooking, hadCompletedPublicMeeting, hasConflict, participants, recomputeRating, systemMessage } from './bookingService.js';
import * as dto from './dto.js';
import { ACTIVITIES, blockedIds, PRIVATE_ACTIVITIES } from './partners.js';

type Booking = typeof bookings.$inferSelect;

export default function bookingRoutes(app: FastifyInstance, ctx: Ctx) {
  async function load(req: FastifyRequest<{ Params: { id: string } }>) {
    const u = requireUser(req);
    const id = parse(z.string().uuid(), req.params.id);
    const [b] = await ctx.db.select().from(bookings).where(eq(bookings.id, id));
    if (!b || (b.clientId !== u.id && b.partnerId !== u.id && u.role !== 'admin')) throw E.notFound('booking_not_found');
    return { u, b };
  }
  const withOther = async (b: Booking, viewerId: string) => {
    const otherId = viewerId === b.partnerId ? b.clientId : b.partnerId;
    return dto.booking(b, (await participants(ctx.db, [otherId])).get(otherId));
  };

  // ---------- Criar pedido ----------
  app.post('/bookings', async (req, reply) => {
    const u = requireVerified(req);
    if (!u.emailVerifiedAt) throw E.forbidden('email_unverified', 'Confirme seu e-mail para fazer reservas.');
    const b = parse(z.object({
      partnerId: z.string().uuid(),
      activity: z.enum(ACTIVITIES),
      startsAt: z.string().datetime({ offset: true }),
      hours: z.number().int().min(1).max(12),
      place: z.string().trim().min(4).max(200),
      note: z.string().trim().max(500).default(''),
      paymentMethod: z.enum(['pix', 'card']).default('pix'),
      shareWithTrustedContact: z.boolean().default(false),
      acceptRules: z.literal(true),
    }), req.body);
    if (b.partnerId === u.id) throw E.badRequest('self_booking');
    const [row] = await ctx.db.select({ u: users, p: partnerProfiles }).from(users).innerJoin(partnerProfiles, eq(partnerProfiles.userId, users.id))
      .where(and(eq(users.id, b.partnerId), eq(users.status, 'active'), eq(users.verification, 'verified'), eq(partnerProfiles.visible, true)));
    if (!row || (await blockedIds(ctx.db, u.id)).has(b.partnerId)) throw E.notFound('partner_not_found');
    const p = row.p;
    if (!p.activities.includes(b.activity)) throw E.unprocessable('activity_not_offered', 'Este parceiro não oferece esse programa.');
    if (b.hours < p.minHours) throw E.unprocessable('below_min_hours', `Mínimo de ${p.minHours} horas.`);
    const start = new Date(b.startsAt);
    if (start.getTime() < Date.now() + 60 * 60_000) throw E.unprocessable('too_soon', 'Reserve com pelo menos 1 hora de antecedência.');
    // O horário precisa estar na disponibilidade do parceiro (horário de Brasília)
    const local = new Date(start.getTime() - 3 * 3600_000);
    const hhmm = local.toISOString().slice(11, 16);
    const slot = await ctx.db.select().from(availability).where(and(eq(availability.partnerId, b.partnerId), eq(availability.weekday, local.getUTCDay()), eq(availability.start, hhmm)));
    if (!slot.length) throw E.unprocessable('slot_unavailable', 'Horário indisponível.');
    if (await hasConflict(ctx.db, b.partnerId, start, b.hours)) throw E.conflict('slot_taken', 'Esse horário acabou de ser reservado.');

    // Regra de segurança: Casa e Sítio
    const privateVenue = PRIVATE_ACTIVITIES.has(b.activity);
    if (privateVenue) {
      if (!(await hadCompletedPublicMeeting(ctx.db, u.id, b.partnerId))) throw E.forbidden('private_venue_locked', 'Casa e Sítio liberam depois de um primeiro encontro concluído em local público.');
      if (!u.trustedContactPhone) throw E.unprocessable('trusted_contact_required', 'Cadastre um contato de confiança antes.');
      if (!b.shareWithTrustedContact) throw E.unprocessable('share_required', 'Para casa ou sítio, o endereço é compartilhado com seu contato de confiança.');
    } else {
      const m = moderateText(b.place);
      if (!m.ok && m.code === 'policy_violation') throw E.unprocessable('policy_violation', 'Local não permitido.');
    }
    const noteCheck = moderateText(b.note);
    if (!noteCheck.ok) throw E.unprocessable(noteCheck.code, 'Remova contatos ou conteúdo não permitido da mensagem.');

    const subtotal = p.priceCents * b.hours;
    const fee = Math.round(subtotal * config.SERVICE_FEE_RATE);
    const [created] = await ctx.db.insert(bookings).values({
      clientId: u.id, partnerId: b.partnerId, activity: b.activity, startsAt: start, hours: b.hours, place: b.place, privateVenue,
      note: b.note, priceCents: p.priceCents, subtotalCents: subtotal, feeCents: fee, totalCents: subtotal + fee, paymentMethod: b.paymentMethod,
    }).returning();
    await systemMessage(ctx.db, created, 'booking_requested', { bookingId: created.id, startsAt: created.startsAt, hours: created.hours });
    await notify(ctx.db, b.partnerId, 'booking_request', { bookingId: created.id, clientName: u.name.split(' ')[0] }, `/painel`);
    await audit(ctx.db, req, 'booking.create', 'booking', created.id);
    return reply.status(201).send({ booking: await withOther(created, u.id) });
  });

  // ---------- Listar / detalhe ----------
  app.get('/bookings', async (req) => {
    const u = requireUser(req);
    const { scope, as } = parse(z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('all'), as: z.enum(['client', 'partner', 'any']).default('any') }), req.query);
    const who = as === 'client' ? eq(bookings.clientId, u.id) : as === 'partner' ? eq(bookings.partnerId, u.id) : or(eq(bookings.clientId, u.id), eq(bookings.partnerId, u.id));
    const statuses = scope === 'upcoming' ? ['requested', 'accepted', 'in_progress'] as const : scope === 'past' ? ['declined', 'cancelled', 'completed'] as const : null;
    const rows = await ctx.db.select().from(bookings).where(statuses ? and(who, inArray(bookings.status, [...statuses])) : who).orderBy(desc(bookings.startsAt)).limit(100);
    const people = await participants(ctx.db, [...new Set(rows.map((b) => (b.partnerId === u.id ? b.clientId : b.partnerId)))]);
    const mine = rows.length ? await ctx.db.select({ bookingId: reviews.bookingId, rating: reviews.rating }).from(reviews)
      .where(and(eq(reviews.authorId, u.id), inArray(reviews.bookingId, rows.map((b) => b.id)))) : [];
    const rated = new Map(mine.map((r) => [r.bookingId, r.rating]));
    return { items: rows.map((b) => ({ ...dto.booking(b, people.get(b.partnerId === u.id ? b.clientId : b.partnerId)), myRating: rated.get(b.id) ?? null })) };
  });

  app.get<{ Params: { id: string } }>('/bookings/:id', async (req) => {
    const { u, b } = await load(req);
    const myReview = await ctx.db.select({ rating: reviews.rating }).from(reviews).where(and(eq(reviews.bookingId, b.id), eq(reviews.authorId, u.id)));
    return { booking: { ...(await withOther(b, u.id)), myRating: myReview[0]?.rating ?? null } };
  });

  // ---------- Parceiro aceita / recusa ----------
  app.post<{ Params: { id: string } }>('/bookings/:id/accept', async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.partnerId) throw E.forbidden();
    if (b.status !== 'requested') throw E.conflict('invalid_status', 'Este pedido não pode mais ser aceito.');
    if (await hasConflict(ctx.db, b.partnerId, b.startsAt, b.hours, b.id)) {
      const others = await ctx.db.select().from(bookings).where(and(eq(bookings.partnerId, b.partnerId), eq(bookings.status, 'accepted')));
      if (others.some((o) => o.startsAt.getTime() < b.startsAt.getTime() + b.hours * 3600_000 && b.startsAt.getTime() < o.startsAt.getTime() + o.hours * 3600_000)) throw E.conflict('slot_taken');
    }
    const [x] = await ctx.db.update(bookings).set({ status: 'accepted', updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    await notify(ctx.db, b.clientId, 'booking_accepted', { bookingId: b.id, partnerName: u.name.split(' ')[0], startsAt: b.startsAt }, `/reservas/${b.id}/pagar`);
    await systemMessage(ctx.db, b, 'booking_accepted', { bookingId: b.id });
    return { booking: await withOther(x, u.id) };
  });

  app.post<{ Params: { id: string } }>('/bookings/:id/decline', async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.partnerId) throw E.forbidden();
    if (b.status !== 'requested') throw E.conflict('invalid_status');
    const [x] = await ctx.db.update(bookings).set({ status: 'declined', updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    await notify(ctx.db, b.clientId, 'booking_declined', { bookingId: b.id, partnerName: u.name.split(' ')[0] }, `/reservas/${b.id}`);
    return { booking: await withOther(x, u.id) };
  });

  // ---------- Cancelar ----------
  app.post<{ Params: { id: string } }>('/bookings/:id/cancel', async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.clientId && u.id !== b.partnerId) throw E.forbidden();
    if (!['requested', 'accepted'].includes(b.status)) throw E.conflict('invalid_status', 'Esta reserva não pode mais ser cancelada.');
    const x = await cancelBooking(ctx, b, u.id);
    await audit(ctx.db, req, 'booking.cancel', 'booking', b.id);
    return { booking: await withOther(x, u.id) };
  });

  // ---------- Check-in, SOS e conclusão ----------
  app.post<{ Params: { id: string } }>('/bookings/:id/check-in', async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.clientId && u.id !== b.partnerId) throw E.forbidden();
    if (b.status !== 'accepted') throw E.conflict('invalid_status');
    if (b.paymentStatus !== 'paid') throw E.unprocessable('payment_required', 'O check-in libera depois do pagamento.');
    const start = b.startsAt.getTime();
    if (isProd && (Date.now() < start - 2 * 3600_000 || Date.now() > start + b.hours * 3600_000)) throw E.unprocessable('outside_window', 'O check-in abre 2 horas antes do encontro.');
    const [x] = await ctx.db.update(bookings).set({ status: 'in_progress', checkInAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    // Contato de confiança recebe os detalhes (obrigatório em casa/sítio)
    const client = u.id === b.clientId ? u : (await ctx.db.select().from(users).where(eq(users.id, b.clientId)))[0];
    if (client?.trustedContactPhone) {
      const partnerName = (await participants(ctx.db, [b.partnerId])).get(b.partnerId)?.name.split(' ')[0] ?? '';
      await ctx.sms.send(client.trustedContactPhone, `RolêJunto: ${client.name.split(' ')[0]} fez check-in com ${partnerName} em ${b.place} às ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}. Duração prevista: ${b.hours} h.`);
    }
    await systemMessage(ctx.db, b, 'checked_in', { bookingId: b.id });
    return { booking: await withOther(x, u.id) };
  });

  app.post<{ Params: { id: string } }>('/bookings/:id/sos', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.clientId && u.id !== b.partnerId) throw E.forbidden();
    const other = u.id === b.clientId ? b.partnerId : b.clientId;
    await ctx.db.insert(reports).values({ reporterId: u.id, targetId: other, reason: 'sos', details: `SOS acionado na reserva ${b.id} em ${b.place}`, priority: 'high' });
    const admins = await ctx.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    for (const a of admins) await notify(ctx.db, a.id, 'sos', { bookingId: b.id, userName: u.name }, `/admin`);
    if (u.trustedContactPhone) await ctx.sms.send(u.trustedContactPhone, `RolêJunto: ${u.name.split(' ')[0]} acionou o SOS durante um encontro em ${b.place}. Tente falar com a pessoa agora. Em emergência, ligue 190.`);
    await audit(ctx.db, req, 'booking.sos', 'booking', b.id);
    return { ok: true, emergencyPhone: '190' };
  });

  app.post<{ Params: { id: string } }>('/bookings/:id/complete', async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.clientId && u.id !== b.partnerId) throw E.forbidden();
    if (b.status !== 'in_progress') throw E.conflict('invalid_status');
    // Encerrar libera o repasse ao parceiro (o pagamento ao parceiro é feito pelo provedor/financeiro)
    const [x] = await ctx.db.update(bookings).set({ status: 'completed', completedAt: new Date(), paymentStatus: 'released', updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    await notify(ctx.db, b.clientId, 'review_request', { bookingId: b.id }, `/reservas/${b.id}`);
    await notify(ctx.db, b.partnerId, 'review_request', { bookingId: b.id }, `/painel`);
    return { booking: await withOther(x, u.id) };
  });

  // ---------- Avaliação ----------
  app.post<{ Params: { id: string } }>('/bookings/:id/review', async (req) => {
    const { u, b } = await load(req);
    if (u.id !== b.clientId && u.id !== b.partnerId) throw E.forbidden();
    if (b.status !== 'completed') throw E.conflict('invalid_status', 'Avalie depois do encontro concluído.');
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().max(600).default('') }), req.body);
    const m = moderateText(body.text);
    if (!m.ok && m.code === 'contact_info') throw E.unprocessable('contact_info', 'Não inclua contatos na avaliação.');
    const target = u.id === b.clientId ? b.partnerId : b.clientId;
    const hidden = !m.ok; // conteúdo impróprio fica oculto e vai para análise
    const [r] = await ctx.db.insert(reviews).values({ bookingId: b.id, authorId: u.id, targetId: target, rating: body.rating, text: body.text, hidden }).onConflictDoNothing().returning();
    if (!r) throw E.conflict('already_reviewed', 'Você já avaliou este encontro.');
    if (hidden) await ctx.db.insert(reports).values({ reporterId: null, targetId: u.id, reason: 'sexual', details: `Avaliação retida: ${body.text}`, priority: 'high' });
    if (target === b.partnerId) await recomputeRating(ctx.db, target);
    return { ok: true };
  });
}
