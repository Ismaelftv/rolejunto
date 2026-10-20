import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { CONFIG } from '../lib/config';
import { useStore } from '../lib/store';
import { post } from '../lib/api';

const SUBJECTS = ['booking_payment', 'safety', 'account', 'other'] as const;
import { useI18n } from '../i18n';

// O formulário envia para POST /api/support (funciona com ou sem login).
export default function Help() {
  const { d, f, lang } = useI18n();
  const [sp] = useSearchParams();
  const rid = sp.get('reserva');
  const bookingId = rid && /^[0-9a-f-]{36}$/i.test(rid) ? rid : undefined;
  useTitle(d.help.title);
  const { toast, user, fail } = useStore();
  const [subject, setSubject] = useState(bookingId ? 0 : 0);
  const [msg, setMsg] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <PageTitle title={d.help.title} sub={d.help.sub} />
      <div className="stack gap-16" style={{ paddingBottom: 32 }}>
        <div className="notice notice-warn"><Icon name="sos" /> {d.help.urgent}</div>
        <div className="card card-pad faq">
          <h2 className="h-sm" style={{ marginBottom: 4 }}>{d.help.faqTitle}</h2>
          {d.help.faq.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
        <form className="card card-pad stack gap-12" noValidate onSubmit={(e) => {
          e.preventDefault();
          if (msg.trim().length < 5) return setErr(d.help.errMsg);
          if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr(d.auth.errEmail);
          setErr(''); setBusy(true);
          post('/support', { subject: SUBJECTS[subject], message: msg.trim(), lang, ...(bookingId && user ? { bookingId } : {}), ...(user ? {} : { email: email.trim() }) })
            .then(() => { setMsg(''); toast(d.help.sent); })
            .catch(fail)
            .finally(() => setBusy(false));
        }}>
          <h2 className="h-sm">{d.help.contactTitle}</h2>
          {bookingId && <div className="notice notice-teal small">{f(d.g.adm2.mine.bookingHint, { id: bookingId.slice(0, 8) })}</div>}
          {user && <Link to="/conta/chamados" className="small bold">{d.g.adm2.mine.title} →</Link>}
          <div className="field">
            <label htmlFor="hs">{d.help.subject}</label>
            <select id="hs" className="select" value={subject} onChange={(e) => setSubject(+e.target.value)}>
              {d.help.subjects.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>
          {!user && (
            <div className="field">
              <label htmlFor="he">{d.auth.email}</label>
              <input id="he" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="hm">{d.help.message}</label>
            <textarea id="hm" className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} />
            {err && <span className="error">{err}</span>}
          </div>
          <button className="btn btn-primary btn-sq" style={{ alignSelf: 'flex-start' }} disabled={busy}><Icon name="send" size={18} /> {d.help.send}</button>
          <span className="xs muted">{CONFIG.supportEmail}</span>
        </form>
      </div>
    </div>
  );
}
