import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ReportModal } from '../components/ReportModal';
import { useTitle } from '../components/ui';
import { ACTIVITIES } from '../data/activities';
import { ApiError, assetUrl, get, post, type ApiConversation, type ApiMessage } from '../lib/api';
import { isMessageAllowed } from '../lib/moderation';
import { usePartner } from '../lib/partners';
import { brDate, useStore } from '../lib/store';
import { useI18n } from '../i18n';

/** Cor estável para a inicial de cada pessoa. */
const colorFor = (id: string) => ACTIVITIES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % ACTIVITIES.length].color;

function Avatar({ id, name, url, size = 48 }: { id: string; name: string; url?: string | null; size?: number }) {
  const src = assetUrl(url);
  return (
    <span className="avatar" style={{ background: src ? `center / cover no-repeat url("${src}")` : colorFor(id), width: size, height: size }}>
      {src ? '' : name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function Messages() {
  const { d, f, weekday, hour } = useI18n();
  useTitle(d.messages.title);
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, fail } = useStore();
  const [convs, setConvs] = useState<ApiConversation[] | null>(null);
  const [msgs, setMsgs] = useState<ApiMessage[]>([]);
  const [text, setText] = useState('');
  const [warn, setWarn] = useState(false);
  const [report, setReport] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    const r = await get<{ items: ApiConversation[] }>('/conversations');
    setConvs(r.items);
    return r.items;
  }, []);

  // Lista de conversas (atualiza a cada 10 s)
  useEffect(() => {
    void loadConvs().catch(() => setConvs([]));
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadConvs().catch(() => {}); }, 10000);
    return () => window.clearInterval(t);
  }, [loadConvs]);

  // /mensagens?com=<pessoa>: abre (ou cria) a conversa com essa pessoa
  const withUser = params.get('com');
  useEffect(() => {
    if (!withUser || !convs) return;
    const found = convs.find((c) => c.other?.id === withUser);
    if (found) { nav(`/mensagens/${found.id}`, { replace: true }); return; }
    if (user?.role === 'parceiro') { nav('/mensagens', { replace: true }); return; }
    post<{ conversation: { id: string } }>('/conversations', { partnerId: withUser })
      .then((r) => { void loadConvs(); nav(`/mensagens/${r.conversation.id}`, { replace: true }); })
      .catch((e) => { fail(e); nav('/mensagens', { replace: true }); });
  }, [withUser, convs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mensagens da conversa aberta (atualiza a cada 4 s)
  const loadMsgs = useCallback(async () => {
    if (!id) return;
    const r = await get<{ items: ApiMessage[] }>(`/conversations/${id}/messages`);
    setMsgs((old) => (old.length === r.items.length && old[old.length - 1]?.id === r.items[r.items.length - 1]?.id ? old : r.items));
  }, [id]);
  useEffect(() => {
    setMsgs([]); setWarn(false); setText('');
    if (!id) return;
    void loadMsgs().catch(() => {});
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadMsgs().catch(() => {}); }, 4000);
    return () => window.clearInterval(t);
  }, [id, loadMsgs]);

  useEffect(() => {
    const box = endRef.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [msgs.length, id]);

  const open = id ? convs?.find((c) => c.id === id) : undefined;
  const other = open?.other ?? null;
  const isPartner = other?.role === 'partner';
  const { p: partner } = usePartner(isPartner ? other?.id : undefined);

  const render = (m: ApiMessage) => {
    if (m.kind !== 'system') return m.body;
    const sys = d.live.sys as Record<string, string>;
    if (m.body === 'booking_requested' && m.data?.startsAt) {
      const local = brDate(String(m.data.startsAt));
      return f(sys.booking_requested, { d: weekday(local.slice(0, 10)), day: Number(local.slice(8, 10)), t: hour(local.slice(11, 16)), n: Number(m.data.hours ?? 0) });
    }
    return sys[m.body] ?? m.body;
  };

  const send = async () => {
    const t = text.trim();
    if (!t || !id || sending) return;
    if (!isMessageAllowed(t)) { setWarn(true); return; }
    setSending(true);
    try {
      const r = await post<{ message: ApiMessage }>(`/conversations/${id}/messages`, { body: t });
      setMsgs((list) => [...list, r.message]);
      setText(''); setWarn(false);
      void loadConvs().catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && e.code === 'contact_info') setWarn(true);
      else { fail(e); if (e instanceof ApiError && e.code === 'policy_violation') setText(''); }
    } finally {
      setSending(false);
    }
  };

  const list = convs ?? [];

  return (
    <div className="container">
      <div className={`chat-layout ${id ? 'has-open' : ''}`}>
        <div className="chat-list" aria-label={d.messages.convos}>
          <h1 className="display h-md" style={{ padding: '4px 4px 8px' }}>{d.messages.title}</h1>
          {convs === null && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 16 }} />)}
          {convs !== null && list.length === 0 && <div className="tile small muted">{d.messages.none}</div>}
          {list.map((c) => c.other && (
            <Link key={c.id} to={`/mensagens/${c.id}`} className={`chat-item ${c.id === id ? 'on' : ''}`}>
              <Avatar id={c.other.id} name={c.other.name} url={c.other.avatarUrl} />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="row between"><strong>{c.other.name.split(' ')[0]}</strong>{c.unread > 0 && <span className="dot" style={{ background: 'var(--accent)' }} aria-label={String(c.unread)} />}</span>
                <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage ? render(c.lastMessage) : d.messages.start}</span>
              </span>
            </Link>
          ))}
        </div>

        <section className="chat-pane" aria-label={other ? f(d.messages.convoWith, { name: other.name }) : d.messages.title}>
          {id && other ? (
            <>
              <div className="row between gap-12" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                <div className="row gap-12">
                  <button className="icon-btn only-mobile" onClick={() => nav('/mensagens')} aria-label={d.messages.backToList}><Icon name="back" /></button>
                  <Link to={isPartner ? `/parceiro/${other.id}` : '#'} onClick={(e) => { if (!isPartner) e.preventDefault(); }} className="row gap-12" style={{ textDecoration: 'none' }}>
                    <Avatar id={other.id} name={other.name} url={other.avatarUrl} size={42} />
                    <span className="stack"><strong>{other.name.split(' ')[0]}</strong>
                      <span className="xs muted">{partner ? (partner.online ? d.messages.onlineNow : f(d.profile.respondsIn, { t: partner.responseTime })) : isPartner ? '' : d.live.clientBadge}</span>
                    </span>
                  </Link>
                </div>
                <button className="icon-btn" aria-label={d.profile.report} onClick={() => setReport(true)}><Icon name="flag" /></button>
              </div>
              <div className="chat-msgs">
                <div className="bubble system">{d.messages.safety}</div>
                {msgs.map((m) => <div key={m.id} className={`bubble ${m.from}`}>{render(m)}</div>)}
                <div ref={endRef} />
              </div>
              {warn && <div className="notice notice-warn" style={{ margin: '0 12px', borderRadius: 12 }}><Icon name="alert" /> {d.messages.modWarn}</div>}
              <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                <label htmlFor="msg" className="sr-only">{d.messages.inputLabel}</label>
                <input id="msg" className="input" placeholder={d.messages.inputPh} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" maxLength={2000} />
                <button type="submit" className="btn btn-primary btn-sq" aria-label={d.common.send} disabled={!text.trim() || sending}><Icon name="send" /></button>
              </form>
            </>
          ) : (
            <div className="empty" style={{ margin: 'auto' }}>
              <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="chat" size={26} /></span>
              <strong>{d.messages.pick}</strong>
            </div>
          )}
        </section>
      </div>
      {report && other && <ReportModal name={other.name.split(' ')[0]} partnerId={other.id} onClose={() => setReport(false)} />}
    </div>
  );
}
