// Modelo de dados do RolêJunto (PostgreSQL, via Drizzle ORM).
import { sql } from 'drizzle-orm';
import {
  boolean, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['client', 'partner', 'admin']);
export const verificationEnum = pgEnum('verification_status', ['pending', 'in_review', 'verified', 'rejected']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const bookingStatusEnum = pgEnum('booking_status', ['requested', 'accepted', 'declined', 'cancelled', 'in_progress', 'completed']);
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'pending', 'paid', 'refunded', 'partially_refunded', 'released']);
export const payMethodEnum = pgEnum('pay_method', ['pix', 'card']);
export const photoStatusEnum = pgEnum('photo_status', ['pending', 'approved', 'rejected']);
export const reportStatusEnum = pgEnum('report_status', ['open', 'warned', 'suspended', 'archived']);
export const priorityEnum = pgEnum('priority', ['high', 'medium', 'low']);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').defaultNow().notNull();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('client'),
  birthDate: date('birth_date').notNull(),
  phone: text('phone'),
  city: text('city'),
  avatarUrl: text('avatar_url'),
  lang: text('lang').notNull().default('pt'),
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
  verification: verificationEnum('verification').notNull().default('pending'),
  emailVerifiedAt: ts('email_verified_at'), // e-mail confirmado com o código enviado
  status: userStatusEnum('status').notNull().default('active'),
  trustedContactName: text('trusted_contact_name'),
  trustedContactPhone: text('trusted_contact_phone'),
  notifEmail: boolean('notif_email').notNull().default(true),
  notifPush: boolean('notif_push').notNull().default(true),
  notifPromos: boolean('notif_promos').notNull().default(false),
  termsAcceptedAt: ts('terms_accepted_at').notNull(),
  privacyConsentAt: ts('privacy_consent_at').notNull(), // consentimento para dados biométricos (LGPD art. 11)
  notifSeenAt: ts('notif_seen_at').defaultNow().notNull(),
  lastSeenAt: ts('last_seen_at').defaultNow().notNull(),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').defaultNow().notNull(),
  deletedAt: ts('deleted_at'),
}, (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)]);

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
});

// Códigos de confirmação de e-mail (6 dígitos, guardados só como hash)
export const emailCodes = pgTable('email_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
}, (t) => [index('email_codes_user_idx').on(t.userId)]);

export const partnerProfiles = pgTable('partner_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio').notNull().default(''),
  about: text('about').notNull().default(''),
  // Versões do bio/about em outros idiomas (opcional): { es: { bio, about }, en: {...}, zh: {...} }
  translations: jsonb('translations').$type<Record<string, { bio?: string; about?: string }>>().notNull().default({}),
  priceCents: integer('price_cents').notNull().default(8000),
  minHours: integer('min_hours').notNull().default(2),
  languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
  activities: text('activities').array().notNull().default(sql`'{}'::text[]`),
  neighborhood: text('neighborhood').notNull().default(''),
  city: text('city').notNull().default(''),
  // Localização já arredondada (~1 km) — nunca guardamos o endereço exato do parceiro.
  approxLat: doublePrecision('approx_lat'),
  approxLng: doublePrecision('approx_lng'),
  visible: boolean('visible').notNull().default(false),
  ratingAvg: real('rating_avg'),
  ratingCount: integer('rating_count').notNull().default(0),
  responseMinutes: integer('response_minutes').notNull().default(60),
  updatedAt: ts('updated_at').defaultNow().notNull(),
});

export const availability = pgTable('availability', {
  partnerId: uuid('partner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(), // 0 = domingo
  start: text('start').notNull(), // 'HH:MM'
}, (t) => [primaryKey({ columns: [t.partnerId, t.weekday, t.start] })]);

export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  status: photoStatusEnum('status').notNull().default('pending'),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
});

// Repasses feitos aos parceiros (o financeiro faz o Pix e registra aqui)
export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => users.id),
  amountCents: integer('amount_cents').notNull(),
  bookingsCount: integer('bookings_count').notNull(),
  method: text('method').notNull().default('pix'),
  note: text('note').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('payouts_partner_idx').on(t.partnerId)]);

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => users.id),
  partnerId: uuid('partner_id').notNull().references(() => users.id),
  activity: text('activity').notNull(),
  startsAt: ts('starts_at').notNull(),
  hours: integer('hours').notNull(),
  place: text('place').notNull(),
  privateVenue: boolean('private_venue').notNull().default(false),
  note: text('note').notNull().default(''),
  priceCents: integer('price_cents').notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  feeCents: integer('fee_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  status: bookingStatusEnum('status').notNull().default('requested'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
  paymentMethod: payMethodEnum('payment_method').notNull().default('pix'),
  payoutId: uuid('payout_id'), // preenchido quando o valor foi repassado ao parceiro
  checkInAt: ts('check_in_at'),
  completedAt: ts('completed_at'),
  cancelledBy: uuid('cancelled_by'),
  cancelledAt: ts('cancelled_at'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').defaultNow().notNull(),
}, (t) => [index('bookings_client_idx').on(t.clientId), index('bookings_partner_idx').on(t.partnerId, t.startsAt)]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  method: payMethodEnum('method').notNull(),
  amountCents: integer('amount_cents').notNull(),
  refundedCents: integer('refunded_cents').notNull().default(0),
  status: paymentStatusEnum('status').notNull().default('pending'),
  pixCode: text('pix_code'),
  pixQrBase64: text('pix_qr_base64'),
  checkoutUrl: text('checkout_url'),
  expiresAt: ts('expires_at'),
  paidAt: ts('paid_at'),
  raw: jsonb('raw'),
  createdAt: createdAt(),
}, (t) => [index('payments_booking_idx').on(t.bookingId), uniqueIndex('payments_ref_uq').on(t.provider, t.providerRef)]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => users.id),
  partnerId: uuid('partner_id').notNull().references(() => users.id),
  lastMessageAt: ts('last_message_at').defaultNow().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('conversations_pair_uq').on(t.clientId, t.partnerId)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id'), // nulo = mensagem do sistema
  kind: text('kind').notNull().default('text'), // text | system
  body: text('body').notNull(),
  data: jsonb('data'), // para mensagens do sistema (código + variáveis, traduzidas no app)
  hidden: boolean('hidden').notNull().default(false), // retida pela moderação
  readAt: ts('read_at'),
  createdAt: createdAt(),
}, (t) => [index('messages_conv_idx').on(t.conversationId, t.createdAt)]);

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  targetId: uuid('target_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  text: text('text').notNull().default(''),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('reviews_booking_author_uq').on(t.bookingId, t.authorId)]);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id'), // nulo = gerado automaticamente pela moderação
  targetId: uuid('target_id').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  priority: priorityEnum('priority').notNull().default('medium'),
  status: reportStatusEnum('status').notNull().default('open'),
  handledBy: uuid('handled_by'),
  handledAt: ts('handled_at'),
  createdAt: createdAt(),
}, (t) => [index('reports_status_idx').on(t.status, t.priority)]);

export const blocks = pgTable('blocks', {
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

export const favorites = pgTable('favorites', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  partnerId: uuid('partner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.partnerId] })]);

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  status: verificationEnum('status').notNull().default('in_review'),
  matchScore: integer('match_score'),
  docAge: integer('doc_age'),
  reviewedBy: uuid('reviewed_by'),
  createdAt: createdAt(),
  decidedAt: ts('decided_at'),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // código traduzido no app: booking_accepted, payment_confirmed…
  data: jsonb('data').notNull().default({}),
  link: text('link'),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)]);

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  email: text('email'),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  data: jsonb('data'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_target_idx').on(t.targetType, t.targetId)]);
