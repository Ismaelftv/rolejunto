import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bookings, partnerProfiles, passwordResets, payments, photos, reports, sessions, supportTickets, users, verifications } from '../db/schema.js';
import { audit, notify, parse, requireRole, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { ageFrom, newCode, sha256 } from '../lib/security.js';
import { renderEmail } from '../lib/emails.js';
import { deleteAccount, runningBookings } from '../lib/accountDeletion.js';
import { vaultRead, vaultRemove } from '../providers/vault.js';
import { cancelBooking, participants } from './bookingService.js';

export default function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const admin = (req: Parameters<typeof requireRole>[0]) => requireRole(req, 'admin');

  app.get('/admin/metrics', async (req) => {
    admin(req);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const n = sql<number>`count(*)::int`;
    return {
      activeUsers: await count(ctx.db.select({ n }).from(users).where(and(eq(users.status, 'active'), gte(users.lastSeenAt, new Date(Date.now() - 30 * 86400_000))))),
      bookingsToday: await count(ctx.db.select({ n }).from(bookings).where(gte(bookings.createdAt, today))),
      verificationQueue: await count(ctx.db.select({ n }).from(verifications).where(eq(verifications.status, 'in_review'))),
      openReports: await count(ctx.db.select({ n }).from(reports).where(eq(reports.status, 'open'))),
      urgentReports: await count(ctx.db.select({ n }).from(reports).where(and(eq(reports.status, 'open'), eq(reports.priority, 'high')))),
      pendingPhotos: await count(ctx.db.select({ n }).from(photos).where(eq(photos.status, 'pending'))),
    };
  });

  // ---------- Verificações ----------
  app.get('/admin/verifications', async (req) => {
    admin(req);
    const rows = await ctx.db.select({ v: verifications, u: users }).from(verifications).innerJoin(users, eq(users.id, verifications.userId))
      .where(eq(verifications.status, 'in_review')).orderBy(verifications.createdAt).limit(100);
    return { items: rows.map(({ v, u }) => ({ id: v.id, userId: u.id, name: u.name, role: u.role, age: ageFrom(u.birthDate), docAge: v.docAge, matchScore: v.matchScore, createdAt: v.createdAt, hasImages: !!(v.frontFile && v.backFile && v.selfieFile) })) };
  });

  // Imagem do documento/selfie (cofre privado): só admin, sem cache, cada abertura fica no histórico
  app.get<{ Params: { id: string; kind: string } }>('/admin/verifications/:id/:kind', async (req, reply) => {
    admin(req);
    const kind = parse(z.enum(['front', 'back', 'selfie']), req.params.kind);
    const [v] = await ctx.db.select().from(verifications).where(and(eq(verifications.id, parse(z.string().uuid(), req.params.id)), eq(verifications.status, 'in_review')));
    const file = v ? (kind === 'front' ? v.frontFile : kind === 'back' ? v.backFile : v.selfieFile) : null;
    const img = file ? await vaultRead(file) : null;
    if (!v || !img) throw E.notFound('image_not_found');
    await audit(ctx.db, req, 'verification.view', 'user', v.userId, { kind });
    return reply.header('Content-Type', img.mime).header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').send(img.buf);
  });

  app.post<{ Params: { id: string; action: string } }>('/admin/verifications/:id/:action', async (req) => {
    const a = admin(req);
    const action = parse(z.enum(['approve', 'reject']), req.params.action);
    const [v] = await ctx.db.select().from(verifications).where(eq(verifications.id, req.params.id));
    if (!v) throw E.notFound();
    const status = action === 'approve' ? 'verified' : 'rejected';
    // Decidido: as imagens são apagadas do cofre (política de privacidade)
    await vaultRemove(v.frontFile, v.backFile, v.selfieFile);
    await ctx.db.update(verifications).set({ status, reviewedBy: a.id, decidedAt: new Date(), frontFile: null, backFile: null, selfieFile: null }).where(eq(verifications.id, v.id));
    await ctx.db.update(users).set({ verification: status }).where(eq(users.id, v.userId));
    await notify(ctx.db, v.userId, status === 'verified' ? 'verification_approved' : 'verification_rejected', {}, '/verificacao');
    await audit(ctx.db, req, `verification.${action}`, 'user', v.userId);
    return { ok: true };
  });

  // ---------- Denúncias ----------
  app.get('/admin/reports', async (req) => {
    admin(req);
    const { status } = parse(z.object({ status: z.enum(['open', 'warned', 'suspended', 'archived']).default('open') }), req.query);
    const rows = await ctx.db.select().from(reports).where(eq(reports.status, status))
      .orderBy(sql`case ${reports.priority} when 'high' then 0 when 'medium' then 1 else 2 end`, desc(reports.createdAt)).limit(200);
    const people = await participants(ctx.db, [...new Set(rows.flatMap((r) => [r.targetId, r.reporterId].filter(Boolean) as string[]))]);
    return { items: rows.map((r) => ({ ...r, targetName: people.get(r.targetId)?.name ?? '', reporterName: r.reporterId ? people.get(r.reporterId)?.name ?? '' : 'Moderação automática' })) };
  });

  app.post<{ Params: { id: string } }>('/admin/reports/:id/action', async (req) => {
    const a = admin(req);
    const { action, note } = parse(z.object({ action: z.enum(['warn', 'suspend', 'archive']), note: z.string().max(500).default('') }), req.body);
    const [r] = await ctx.db.select().from(reports).where(eq(reports.id, req.params.id));
    if (!r) throw E.notFound();
    const status = action === 'warn' ? 'warned' : action === 'suspend' ? 'suspended' : 'archived';
    await ctx.db.update(reports).set({ status, handledBy: a.id, handledAt: new Date() }).where(eq(reports.id, r.id));
    if (action === 'warn') await notify(ctx.db, r.targetId, 'account_warning', { reason: r.reason });
    if (action === 'suspend') await suspendUser(r.targetId, a.id);
    await audit(ctx.db, req, `report.${action}`, 'user', r.targetId, { reportId: r.id, note });
    return { ok: true };
  });

  async function suspendUser(userId: string, actorId: string) {
    await ctx.db.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
    await ctx.db.delete(sessions).where(eq(sessions.userId, userId));
    await ctx.db.update(partnerProfiles).set({ visible: false }).where(eq(partnerProfiles.userId, userId));
    // Cancela reservas abertas; a outra parte recebe reembolso integral
    const open = await ctx.db.select().from(bookings).where(and(or(eq(bookings.clientId, userId), eq(bookings.partnerId, userId)), inArray(bookings.status, ['requested', 'accepted'])));
    for (const b of open) await cancelBooking(ctx, b, actorId, { forceFullRefund: true });
  }

  // ---------- Fotos e avaliações retidas ----------
  app.get('/admin/photos', async (req) => {
    admin(req);
    const rows = await ctx.db.select({ p: photos, name: users.name }).from(photos).innerJoin(users, eq(users.id, photos.partnerId)).where(eq(photos.status, 'pending')).orderBy(photos.createdAt).limit(100);
    return { items: rows.map(({ p, name }) => ({ ...p, partnerName: name })) };
  });
  app.post<{ Params: { id: string; action: string } }>('/admin/photos/:id/:action', async (req) => {
    admin(req);
    const action = parse(z.enum(['approve', 'reject']), req.params.action);
    const [p] = await ctx.db.update(photos).set({ status: action === 'approve' ? 'approved' : 'rejected' }).where(eq(photos.id, req.params.id)).returning();
    if (!p) throw E.notFound();
    if (action === 'reject') await notify(ctx.db, p.partnerId, 'photo_rejected', {}, '/painel');
    await audit(ctx.db, req, `photo.${action}`, 'photo', p.id);
    return { ok: true };
  });
  // ---------- Usuários ----------
  const userRow = (u: typeof users.$inferSelect) => ({ id: u.id, name: u.name, email: u.email, role: u.role, verification: u.verification, status: u.status, createdAt: u.createdAt });

  app.get('/admin/users', async (req) => {
    admin(req);
    const q = parse(z.object({
      q: z.string().trim().max(80).default(''), role: z.enum(['client', 'partner', 'admin']).optional(),
      status: z.enum(['active', 'suspended', 'deleted']).optional(), verification: z.enum(['pending', 'in_review', 'verified', 'rejected']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0),
    }), req.query);
    const where = and(
      q.q ? or(ilike(users.name, `%${q.q}%`), ilike(users.email, `%${q.q}%`)) : undefined,
      q.role ? eq(users.role, q.role) : undefined, q.status ? eq(users.status, q.status) : undefined, q.verification ? eq(users.verification, q.verification) : undefined,
    );
    const [rows, [{ n }]] = await Promise.all([
      ctx.db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(q.limit).offset(q.offset),
      ctx.db.select({ n: sql<number>`count(*)::int` }).from(users).where(where),
    ]);
    return { items: rows.map(userRow), total: n };
  });

  // Ficha completa do usuário
  app.get<{ Params: { id: string } }>('/admin/users/:id', async (req) => {
    admin(req);
    const id = parse(z.string().uuid(), req.params.id);
    const [u] = await ctx.db.select().from(users).where(eq(users.id, id));
    if (!u) throw E.notFound();
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const [asClient, asPartner, against, made, tickets, sess, [prof], pics, [lastV]] = await Promise.all([
      count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.clientId, id))),
      count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.partnerId, id))),
      count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(reports).where(eq(reports.targetId, id))),
      count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(reports).where(eq(reports.reporterId, id))),
      count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(supportTickets).where(eq(supportTickets.userId, id))),
      count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessions).where(eq(sessions.userId, id))),
      ctx.db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, id)),
      ctx.db.select({ status: photos.status }).from(photos).where(eq(photos.partnerId, id)),
      ctx.db.select().from(verifications).where(eq(verifications.userId, id)).orderBy(desc(verifications.createdAt)).limit(1),
    ]);
    return {
      user: {
        ...userRow(u), phone: u.phone, city: u.city, lang: u.lang, birthDate: u.birthDate, age: ageFrom(u.birthDate), emailVerified: !!u.emailVerifiedAt,
        lastSeenAt: u.lastSeenAt, termsAcceptedAt: u.termsAcceptedAt, deletedAt: u.deletedAt,
        locked: !!u.lockedUntil && u.lockedUntil > new Date(), failedLogins: u.failedLogins,
      },
      stats: { bookingsAsClient: asClient, bookingsAsPartner: asPartner, reportsAgainst: against, reportsMade: made, tickets, sessions: sess },
      partner: prof ? { visible: prof.visible, city: prof.city, priceCents: prof.priceCents, activities: prof.activities, photos: { total: pics.length, pending: pics.filter((x) => x.status === 'pending').length, approved: pics.filter((x) => x.status === 'approved').length } } : null,
      verification: { status: u.verification, lastAttempt: lastV ? { status: lastV.status, createdAt: lastV.createdAt, decidedAt: lastV.decidedAt } : null, inReview: lastV?.status === 'in_review' },
    };
  });

  // Edição de dados da conta
  app.patch<{ Params: { id: string } }>('/admin/users/:id', async (req) => {
    const a = admin(req);
    const id = parse(z.string().uuid(), req.params.id);
    const b = parse(z.object({
      name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(200),
      phone: z.string().trim().max(30).nullable(), city: z.string().trim().max(80).nullable(), lang: z.enum(['pt', 'es', 'en', 'zh']),
      emailVerified: z.boolean(), verification: z.enum(['verified', 'pending']),
    }).partial(), req.body);
    const [u] = await ctx.db.select().from(users).where(eq(users.id, id));
    if (!u || u.status === 'deleted') throw E.notFound();
    const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    const changed: string[] = [];
    if (b.name !== undefined && b.name !== u.name) { set.name = b.name; changed.push('name'); }
    if (b.phone !== undefined && (b.phone || null) !== u.phone) { set.phone = b.phone || null; changed.push('phone'); }
    if (b.city !== undefined && (b.city || null) !== u.city) { set.city = b.city || null; changed.push('city'); }
    if (b.lang !== undefined && b.lang !== u.lang) { set.lang = b.lang; changed.push('lang'); }
    if (b.email !== undefined && b.email !== u.email.toLowerCase()) {
      const [dup] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${b.email}`);
      if (dup) throw E.conflict('email_taken', 'Já existe uma conta com esse e-mail.');
      set.email = b.email; set.emailVerifiedAt = b.emailVerified ? new Date() : null; changed.push('email'); // e-mail novo precisa ser confirmado
    } else if (b.emailVerified !== undefined && b.emailVerified !== !!u.emailVerifiedAt) {
      set.emailVerifiedAt = b.emailVerified ? new Date() : null; changed.push('emailVerified');
    }
    if (b.verification !== undefined && b.verification !== u.verification) {
      set.verification = b.verification; changed.push('verification');
      if (b.verification === 'verified') {
        // Aprovação manual fecha análises abertas e apaga as imagens guardadas
        const open = await ctx.db.select().from(verifications).where(and(eq(verifications.userId, id), eq(verifications.status, 'in_review')));
        for (const v of open) await vaultRemove(v.frontFile, v.backFile, v.selfieFile);
        await ctx.db.update(verifications).set({ status: 'verified', reviewedBy: a.id, decidedAt: new Date(), frontFile: null, backFile: null, selfieFile: null }).where(and(eq(verifications.userId, id), eq(verifications.status, 'in_review')));
      }
    }
    if (!changed.length) return { user: userRow(u), changed };
    const [n] = await ctx.db.update(users).set(set).where(eq(users.id, id)).returning();
    await audit(ctx.db, req, 'user.edit', 'user', id, { fields: changed });
    return { user: userRow(n), changed };
  });

  // Exclusão (LGPD): anonimiza, cancela reservas abertas e apaga fotos e imagens. Exige confirmação.
  app.delete<{ Params: { id: string } }>('/admin/users/:id', async (req) => {
    const a = admin(req);
    const id = parse(z.string().uuid(), req.params.id);
    const b = parse(z.object({ confirm: z.literal(true), reason: z.string().trim().max(300).optional() }), req.body ?? {});
    const [u] = await ctx.db.select().from(users).where(eq(users.id, id));
    if (!u || u.status === 'deleted') throw E.notFound();
    if (u.role === 'admin') throw E.forbidden('admin_protected', 'Contas de administrador não podem ser excluídas por aqui.');
    if (u.id === a.id) throw E.forbidden('self_delete', 'Você não pode excluir a própria conta por aqui.');
    const running = await runningBookings(ctx, id);
    if (running) throw E.conflict('booking_in_progress', 'Há um encontro em andamento. Espere terminar ou cancele a reserva antes.');
    await deleteAccount(ctx, u, a.id, req, { reason: b.reason });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/admin/users/:id/suspend', async (req) => {
    const a = admin(req);
    const [t] = await ctx.db.select({ role: users.role }).from(users).where(eq(users.id, parse(z.string().uuid(), req.params.id)));
    if (!t) throw E.notFound();
    if (t.role === 'admin') throw E.forbidden('admin_protected', 'Contas de administrador não podem ser suspensas.');
    await suspendUser(req.params.id, a.id);
    await audit(ctx.db, req, 'user.suspend', 'user', req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/admin/users/:id/reinstate', async (req) => {
    admin(req);
    await ctx.db.update(users).set({ status: 'active' }).where(and(eq(users.id, req.params.id), eq(users.status, 'suspended')));
    await audit(ctx.db, req, 'user.reinstate', 'user', req.params.id);
    return { ok: true };
  });

  // Desconecta a pessoa de todos os aparelhos e destrava o login (tentativas erradas)
  app.post<{ Params: { id: string } }>('/admin/users/:id/revoke-sessions', async (req) => {
    admin(req);
    const id = parse(z.string().uuid(), req.params.id);
    await ctx.db.delete(sessions).where(eq(sessions.userId, id));
    await ctx.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
    await audit(ctx.db, req, 'user.revoke_sessions', 'user', id);
    return { ok: true };
  });

  // Manda por e-mail o código de redefinição de senha (a pessoa define a nova senha; o admin nunca vê senha)
  app.post<{ Params: { id: string } }>('/admin/users/:id/send-reset', async (req) => {
    admin(req);
    const [u] = await ctx.db.select().from(users).where(eq(users.id, parse(z.string().uuid(), req.params.id)));
    if (!u || u.status === 'deleted') throw E.notFound();
    const code = newCode();
    await ctx.db.insert(passwordResets).values({ userId: u.id, codeHash: sha256(`${u.id}:${code}`), expiresAt: new Date(Date.now() + 15 * 60_000) });
    const sent = await ctx.mailer.send(u.email, renderEmail('password_reset', u.lang, { name: u.name.split(' ')[0], code }));
    await audit(ctx.db, req, 'user.send_reset', 'user', u.id);
    return { ok: sent };
  });

  // ---------- Chamados de suporte ----------
  app.get('/admin/support', async (req) => {
    admin(req);
    const q = parse(z.object({ status: z.enum(['open', 'answered', 'closed', 'all']).default('open') }), req.query);
    const rows = await ctx.db.select({ t: supportTickets, name: users.name }).from(supportTickets).leftJoin(users, eq(users.id, supportTickets.userId))
      .where(q.status === 'all' ? undefined : eq(supportTickets.status, q.status)).orderBy(desc(supportTickets.createdAt)).limit(100);
    return { items: rows.map(({ t, name }) => ({ id: t.id, protocol: t.id.slice(0, 8).toUpperCase(), userId: t.userId, name, email: t.email, subject: t.subject, message: t.message, status: t.status, bookingId: t.bookingId, reply: t.reply, repliedAt: t.repliedAt, createdAt: t.createdAt })) };
  });

  app.post<{ Params: { id: string } }>('/admin/support/:id/reply', async (req) => {
    const a = admin(req);
    const b = parse(z.object({ message: z.string().trim().min(2).max(4000), close: z.boolean().default(true) }), req.body);
    const [t] = await ctx.db.select().from(supportTickets).where(eq(supportTickets.id, parse(z.string().uuid(), req.params.id)));
    if (!t) throw E.notFound();
    const protocol = t.id.slice(0, 8).toUpperCase();
    let sent = false;
    if (t.email) {
      sent = await ctx.mailer.send(t.email, {
        subject: `RolêJunto · resposta ao seu chamado ${protocol}`,
        text: `${b.message}\n\n—\nSeu chamado ${protocol}:\n"${t.message.slice(0, 500)}"\n\nEquipe RolêJunto`,
      });
    }
    await ctx.db.update(supportTickets).set({ reply: b.message, repliedAt: new Date(), repliedBy: a.id, status: b.close ? 'closed' : 'answered' }).where(eq(supportTickets.id, t.id));
    if (t.userId) await notify(ctx.db, t.userId, 'support_reply', { protocol }, '/conta/chamados');
    await audit(ctx.db, req, 'support.reply', 'ticket', t.id);
    return { ok: true, emailSent: sent };
  });

  app.post<{ Params: { id: string } }>('/admin/support/:id/close', async (req) => {
    admin(req);
    const [t] = await ctx.db.update(supportTickets).set({ status: 'closed' }).where(eq(supportTickets.id, parse(z.string().uuid(), req.params.id))).returning();
    if (!t) throw E.notFound();
    await audit(ctx.db, req, 'support.close', 'ticket', t.id);
    return { ok: true };
  });

  // ---------- Reembolsos que a equipe precisa devolver à mão (provedor sem API de estorno) ----------
  app.get('/admin/refunds', async (req) => {
    admin(req);
    const rows = await ctx.db.select({ p: payments, client: users.name, email: users.email }).from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId)).innerJoin(users, eq(users.id, bookings.clientId))
      .where(and(eq(payments.provider, 'sharkpay'), sql`${payments.refundedCents} > 0`, isNull(payments.refundDoneAt))).orderBy(desc(payments.createdAt)).limit(100);
    return { items: rows.map(({ p, client, email }) => ({ id: p.id, bookingId: p.bookingId, client, email, refundCents: p.refundedCents, providerRef: p.providerRef, createdAt: p.createdAt })) };
  });

  app.post<{ Params: { id: string } }>('/admin/refunds/:id/done', async (req) => {
    admin(req);
    const [p] = await ctx.db.update(payments).set({ refundDoneAt: new Date() }).where(and(eq(payments.id, parse(z.string().uuid(), req.params.id)), isNull(payments.refundDoneAt))).returning();
    if (!p) throw E.notFound();
    await audit(ctx.db, req, 'payment.refund_done', 'payment', p.id, { amountCents: p.refundedCents });
    return { ok: true };
  });
}
