// Formatos de resposta (o que o app recebe). Nunca inclui senha, sessão ou dados de outras pessoas além do necessário.
import type { UserRow } from '../lib/context.js';
import type { bookings, partnerProfiles } from '../db/schema.js';

export const me = (u: UserRow) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, birthDate: u.birthDate, phone: u.phone, city: u.city,
  avatarUrl: u.avatarUrl, lang: u.lang, interests: u.interests, verification: u.verification, emailVerified: !!u.emailVerifiedAt,
  trustedContact: u.trustedContactPhone ? { name: u.trustedContactName ?? '', phone: u.trustedContactPhone } : null,
  notifications: { email: u.notifEmail, push: u.notifPush, promos: u.notifPromos },
  notifSeenAt: u.notifSeenAt, createdAt: u.createdAt,
});

type Profile = typeof partnerProfiles.$inferSelect;
export const partnerCard = (u: Pick<UserRow, 'id' | 'name' | 'birthDate' | 'avatarUrl' | 'lastSeenAt'>, p: Profile, distanceKm: number | null, age: number) => ({
  id: u.id, name: u.name, age, avatarUrl: u.avatarUrl, bio: p.bio, translations: p.translations, activities: p.activities, priceCents: p.priceCents,
  minHours: p.minHours, languages: p.languages, neighborhood: p.neighborhood, city: p.city,
  rating: p.ratingAvg, reviewsCount: p.ratingCount, responseMinutes: p.responseMinutes,
  distanceKm, online: Date.now() - u.lastSeenAt.getTime() < 5 * 60 * 1000,
});

type Booking = typeof bookings.$inferSelect;
export const booking = (b: Booking, other?: { id: string; name: string; avatarUrl: string | null; role?: string }) => ({
  id: b.id, clientId: b.clientId, partnerId: b.partnerId, activity: b.activity, startsAt: b.startsAt, hours: b.hours,
  place: b.place, privateVenue: b.privateVenue, note: b.note,
  priceCents: b.priceCents, subtotalCents: b.subtotalCents, feeCents: b.feeCents, totalCents: b.totalCents,
  status: b.status, paymentStatus: b.paymentStatus, paymentMethod: b.paymentMethod,
  checkInAt: b.checkInAt, completedAt: b.completedAt, cancelledAt: b.cancelledAt, createdAt: b.createdAt,
  other: other ?? null,
});
