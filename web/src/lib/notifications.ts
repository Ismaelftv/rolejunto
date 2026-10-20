// Notificações vindas da API, traduzidas no idioma atual.
import type { IconName } from '../components/Icon';
import { useI18n } from '../i18n';
import { useStore } from './store';

export interface Notif { id: string; icon: IconName; tone: string; title: string; text: string; at: number; to: string; unread: boolean }

const LOOK: Record<string, [IconName, string]> = {
  booking_request: ['calendar', 'var(--accent)'],
  booking_accepted: ['check', 'var(--teal)'],
  booking_declined: ['x', 'var(--danger)'],
  booking_cancelled: ['x', 'var(--danger)'],
  payment_confirmed: ['lock', 'var(--teal)'],
  payment_confirmed_partner: ['wallet', 'var(--teal)'],
  review_request: ['star', 'var(--star)'],
  new_message: ['chat', 'var(--accent)'],
  verification_approved: ['shield', 'var(--teal)'],
  verification_rejected: ['id', 'var(--danger)'],
  account_warning: ['alert', 'var(--amber)'],
  photo_rejected: ['camera', 'var(--amber)'],
  sos: ['sos', 'var(--danger)'],
  urgent_report: ['flag', 'var(--danger)'],
  payout_sent: ['wallet', 'var(--teal)'],
};

export function useNotifications(): Notif[] {
  const { d, f, weekday, money } = useI18n();
  const { user, notifications, bookings } = useStore();
  const ntf = d.live.ntf as Record<string, string[]>;

  const list: Notif[] = notifications.map((n) => {
    const data = n.data ?? {};
    const booking = typeof data.bookingId === 'string' ? bookings.find((b) => b.id === data.bookingId) : undefined;
    const name = String(data.partnerName ?? data.clientName ?? data.fromName ?? data.userName ?? booking?.other.name ?? '');
    let when = '';
    if (booking) when = `${weekday(booking.date)} ${Number(booking.date.slice(8, 10))}`;
    const [title, text] = ntf[n.type] ?? ntf.other;
    const [icon, tone] = LOOK[n.type] ?? ['bell', 'var(--accent)'];
    return {
      id: n.id, icon, tone, title: f(title, { name, d: when }), text: f(text, { name, d: when, v: typeof data.amountCents === 'number' ? money(data.amountCents / 100) : '' }),
      at: new Date(n.createdAt).getTime(), to: n.link || '/notificacoes', unread: n.unread,
    };
  });

  // Lembretes de segurança (não contam como "não lidas")
  if (user && !user.emailVerified) list.unshift({ id: 'email', icon: 'send', tone: 'var(--accent)', title: d.live.confirm.reminderTitle, text: d.live.confirm.reminderText, at: Date.now(), to: '/confirmar-email', unread: false });
  if (user && user.verification !== 'verificado' && user.verification !== 'em_analise') list.unshift({ id: 'verify', icon: 'id', tone: 'var(--accent)', title: d.notif.verify, text: d.notif.verifyText, at: Date.now() - 60000, to: '/verificacao', unread: false });
  if (user && user.role === 'cliente' && !user.trustedContact?.phone) list.unshift({ id: 'contact', icon: 'shield', tone: 'var(--teal)', title: d.notif.contact, text: d.notif.contactText, at: Date.now() - 120000, to: '/conta', unread: false });

  return list.sort((a, b) => b.at - a.at);
}
