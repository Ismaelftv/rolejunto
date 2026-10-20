import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageTitle, useTitle } from '../components/ui';
import { get } from '../lib/api';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

interface T { id: string; protocol: string; subject: string; message: string; status: 'open' | 'answered' | 'closed'; bookingId: string | null; reply: string | null; repliedAt: string | null; createdAt: string }

// Chamados abertos pela pessoa e as respostas da equipe.
export default function MyTickets() {
  const { d, f, locale } = useI18n();
  const m = d.g.adm2.mine;
  useTitle(m.title);
  const { fail } = useStore();
  const [items, setItems] = useState<T[] | null>(null);
  useEffect(() => { get<{ items: T[] }>('/me/tickets').then((r) => setItems(r.items)).catch(fail); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const subj = (k: string) => d.g.adm2.support.subjects[k as keyof typeof d.g.adm2.support.subjects] ?? k;
  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <PageTitle title={m.title} />
      <div className="stack gap-12" style={{ paddingBottom: 32 }}>
        {!items ? <div className="skeleton" style={{ height: 120, borderRadius: 16 }} /> : items.length === 0 ? (
          <div className="empty"><strong>{m.empty}</strong><Link to="/ajuda" className="btn btn-primary btn-sq">{d.help.title}</Link></div>
        ) : items.map((t) => (
          <div key={t.id} className="card card-pad stack gap-8">
            <div className="row wrap between gap-8">
              <strong>{subj(t.subject)} · {t.protocol}</strong>
              <span className={`badge ${t.status === 'open' ? 'badge-warn' : 'badge-teal'}`}>{m.status[t.status]}</span>
            </div>
            <span className="xs muted">{when(t.createdAt)}{t.bookingId ? ` · ${f(m.booking, { id: t.bookingId.slice(0, 8) })}` : ''}</span>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.message}</p>
            {t.reply && <div className="tile small"><strong>{m.reply}</strong>{t.repliedAt && <span className="xs muted"> · {when(t.repliedAt)}</span>}<p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{t.reply}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
