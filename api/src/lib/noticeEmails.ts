// Manda por e-mail os mesmos avisos que aparecem nas notificações do app.
// Respeita a preferência "E-mails sobre reservas" (Perfil → Notificações), exceto avisos de segurança e de conta.
import { eq } from 'drizzle-orm';
import { bookings, users } from '../db/schema.js';
import type { Ctx } from './context.js';
import { setNotifyHook } from './context.js';
import { asLang, NOTICE_TYPES, renderNotice } from './emails.js';

const ALWAYS = new Set(['sos', 'urgent_report', 'verification_approved', 'verification_rejected', 'account_warning', 'payout_sent']);
const CHAT_GAP = 30 * 60_000; // no máximo 1 e-mail por conversa a cada 30 minutos
const LOCALE = { pt: 'pt-BR', es: 'es-ES', en: 'en-US', zh: 'zh-CN' } as const;

export function installNoticeEmails(ctx: Ctx) {
  const lastChat = new Map<string, number>();
  setNotifyHook(async (db, userId, type, data, link) => {
    if (!NOTICE_TYPES.has(type)) return;
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u || u.status !== 'active') return;
    if (!ALWAYS.has(type) && !u.notifEmail) return;
    if (type === 'new_message') {
      const key = `${userId}:${String(data.conversationId ?? '')}`;
      const last = lastChat.get(key) ?? 0;
      if (Date.now() - last < CHAT_GAP) return;
      lastChat.set(key, Date.now());
      if (lastChat.size > 5000) lastChat.clear();
    }
    const L = asLang(u.lang);
    let name = [data.partnerName, data.clientName, data.fromName, data.userName].find((x) => typeof x === 'string' && x) as string | undefined;
    let when = '';
    if (typeof data.bookingId === 'string') {
      const [b] = await db.select().from(bookings).where(eq(bookings.id, data.bookingId));
      if (b) {
        when = new Intl.DateTimeFormat(LOCALE[L], { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(b.startsAt);
        if (!name) {
          const otherId = b.clientId === userId ? b.partnerId : b.clientId;
          const [o] = await db.select({ name: users.name }).from(users).where(eq(users.id, otherId));
          name = o?.name;
        }
      }
    }
    const v = typeof data.amountCents === 'number' ? new Intl.NumberFormat(LOCALE[L], { style: 'currency', currency: 'BRL' }).format(data.amountCents / 100) : '';
    const mail = renderNotice(type, L, { name: name?.split(' ')[0], when, v }, link);
    if (mail) await ctx.mailer.send(u.email, mail);
  });
}
