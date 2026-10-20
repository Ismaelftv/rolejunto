// Exclusão de conta (LGPD): usada pelo próprio usuário e pelo admin. Dados financeiros ficam anonimizados pelo prazo legal; o resto é apagado.
import { and, eq, inArray, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { availability, bookings, favorites, oauthAccounts, partnerProfiles, photos, sessions, timeOff, users, verifications } from '../db/schema.js';
import { audit, type Ctx } from './context.js';
import { cancelBooking } from '../modules/bookingService.js';
import { vaultRemove } from '../providers/vault.js';

type UserRow = typeof users.$inferSelect;

/** Quantas reservas ainda estão em andamento (não dá para excluir no meio de um encontro). */
export async function runningBookings(ctx: Ctx, userId: string) {
  const rows = await ctx.db.select({ id: bookings.id }).from(bookings)
    .where(and(or(eq(bookings.clientId, userId), eq(bookings.partnerId, userId)), eq(bookings.status, 'in_progress')));
  return rows.length;
}

export async function deleteAccount(ctx: Ctx, u: UserRow, actorId: string, req: FastifyRequest | null, extra?: Record<string, unknown>) {
  // Reservas abertas são canceladas: reembolso integral se quem sai é o parceiro ou se foi o admin; senão vale a regra normal de cancelamento
  const open = await ctx.db.select().from(bookings).where(and(or(eq(bookings.clientId, u.id), eq(bookings.partnerId, u.id)), inArray(bookings.status, ['requested', 'accepted'])));
  for (const bk of open) await cancelBooking(ctx, bk, actorId, { forceFullRefund: actorId !== u.id || bk.partnerId === u.id });
  if (u.avatarUrl) await ctx.storage.remove(u.avatarUrl);
  // Fotos do perfil e imagens de verificação
  const pics = await ctx.db.delete(photos).where(eq(photos.partnerId, u.id)).returning({ url: photos.url });
  for (const p of pics) await ctx.storage.remove(p.url);
  const vs = await ctx.db.select().from(verifications).where(eq(verifications.userId, u.id));
  for (const v of vs) await vaultRemove(v.frontFile, v.backFile, v.selfieFile);
  await ctx.db.update(verifications).set({ frontFile: null, backFile: null, selfieFile: null }).where(eq(verifications.userId, u.id));
  await ctx.db.update(users).set({
    email: `removido+${u.id}@rolejunto.invalid`, name: 'Usuário removido', phone: null, city: null, avatarUrl: null,
    trustedContactName: null, trustedContactPhone: null, interests: [], status: 'deleted', deletedAt: new Date(), passwordHash: 'x',
    referralCode: null,
  }).where(eq(users.id, u.id));
  await ctx.db.delete(oauthAccounts).where(eq(oauthAccounts.userId, u.id));
  await ctx.db.update(partnerProfiles).set({ visible: false, bio: '', about: '', approxLat: null, approxLng: null }).where(eq(partnerProfiles.userId, u.id));
  await ctx.db.delete(availability).where(eq(availability.partnerId, u.id));
  await ctx.db.delete(timeOff).where(eq(timeOff.partnerId, u.id));
  await ctx.db.delete(favorites).where(eq(favorites.userId, u.id));
  await ctx.db.delete(sessions).where(eq(sessions.userId, u.id));
  await audit(ctx.db, req, actorId === u.id ? 'user.delete' : 'user.delete_by_admin', 'user', u.id, extra);
}
