import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { DB } from '../db/index.js';
import { auditLogs, notifications, users } from '../db/schema.js';
import type { PaymentProvider } from '../providers/payments.js';
import type { Mailer, Sms } from '../providers/messaging.js';
import type { Storage } from '../providers/storage.js';
import type { OAuthVerifier } from '../providers/oauth.js';
import { E } from './errors.js';
import { publish } from './events.js';

export type UserRow = typeof users.$inferSelect;

export interface Ctx {
  db: DB;
  payments: PaymentProvider;
  mailer: Mailer;
  sms: Sms;
  storage: Storage;
  oauth: OAuthVerifier;
}

declare module 'fastify' {
  interface FastifyRequest { user?: UserRow; sessionId?: string }
}

export function requireUser(req: FastifyRequest): UserRow {
  if (!req.user) throw E.unauthorized();
  return req.user;
}

export function requireRole(req: FastifyRequest, ...roles: UserRow['role'][]): UserRow {
  const u = requireUser(req);
  if (!roles.includes(u.role) && u.role !== 'admin') throw E.forbidden();
  return u;
}

export function requireVerified(req: FastifyRequest): UserRow {
  const u = requireUser(req);
  if (u.verification !== 'verified') throw E.forbidden('verification_required', 'Verifique sua identidade para continuar.');
  return u;
}

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw E.badRequest('validation', 'Dados inválidos.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

type NotifyHook = (db: DB, userId: string, type: string, data: Record<string, unknown>, link?: string) => Promise<void>;
let notifyHook: NotifyHook | null = null;
const pending = new Set<Promise<void>>();
/** Liga um "ouvinte" das notificações (usado para mandar o aviso também por e-mail). */
export function setNotifyHook(fn: NotifyHook | null) { notifyHook = fn; }
/** Espera os e-mails de aviso em andamento (usado nos testes e ao desligar o servidor). */
export async function flushNotices() { await Promise.allSettled([...pending]); }

export async function notify(db: DB, userId: string, type: string, data: Record<string, unknown> = {}, link?: string) {
  const [n] = await db.insert(notifications).values({ userId, type, data, link }).returning();
  publish(userId, 'notification', { id: n.id, type, data, link: link ?? null, createdAt: n.createdAt, unread: true });
  if (notifyHook) {
    // em segundo plano: o envio do e-mail nunca atrasa nem derruba a ação do usuário
    const p = notifyHook(db, userId, type, data, link).catch(() => {}).finally(() => pending.delete(p));
    pending.add(p);
  }
}

export async function audit(db: DB, req: FastifyRequest | null, action: string, targetType?: string, targetId?: string, data?: unknown) {
  await db.insert(auditLogs).values({ actorId: req?.user?.id ?? null, action, targetType, targetId, data: data ?? null, ip: req?.ip ?? null });
}

export const ok = (reply: FastifyReply, body: unknown = { ok: true }, status = 200) => reply.status(status).send(body);
