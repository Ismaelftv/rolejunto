import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { useNotifications } from '../lib/notifications';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

export default function Notifications() {
  const { d, locale } = useI18n();
  useTitle(d.notif.title);
  const { markNotifsSeen, refreshNotifs } = useStore();
  const list = useNotifications();
  useEffect(() => { void refreshNotifs().catch(() => {}); }, [refreshNotifs]);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const groups = [
    { label: d.notif.today, items: list.filter((n) => n.at >= startOfDay.getTime()) },
    { label: d.notif.earlier, items: list.filter((n) => n.at < startOfDay.getTime()) },
  ].filter((g) => g.items.length);
  const hasUnread = list.some((n) => n.unread);
  const time = (at: number) => (at >= startOfDay.getTime()
    ? new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : new Date(at).toLocaleDateString(locale, { day: '2-digit', month: 'short' }));

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <PageTitle title={d.notif.title} back="/explorar" />
      {hasUnread && <button className="btn btn-light btn-sm" style={{ marginBottom: 16 }} onClick={() => void markNotifsSeen()}><Icon name="check" size={16} /> {d.notif.markAll}</button>}
      {list.length === 0 && (
        <div className="empty">
          <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="bell" size={26} /></span>
          <strong>{d.notif.empty}</strong>
        </div>
      )}
      <div className="stack gap-24" style={{ paddingBottom: 24 }}>
        {groups.map((g) => (
          <div key={g.label} className="stack gap-8">
            <span className="eyebrow">{g.label}</span>
            {g.items.map((n) => (
              <Link key={n.id} to={n.to} className="card row gap-12" style={{ padding: 14, textDecoration: 'none', alignItems: 'flex-start', background: n.unread ? 'var(--white)' : 'var(--white)', borderColor: n.unread ? 'var(--ink)' : 'var(--line)' }}>
                <span className="icon-box" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--soft)', color: n.tone }}><Icon name={n.icon} size={20} /></span>
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <span className="row between gap-8"><strong style={{ fontSize: 15 }}>{n.title}</strong><span className="xs muted" style={{ whiteSpace: 'nowrap' }}>{time(n.at)}</span></span>
                  {n.text && <span className="small muted">{n.text}</span>}
                </span>
                {n.unread && <span className="dot" style={{ background: 'var(--accent)', marginTop: 6 }} aria-hidden />}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
