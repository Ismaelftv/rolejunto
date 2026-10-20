// Ferramentas do admin: fotos de verificação, gestão de usuários, suporte e reembolsos manuais.
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui';
import { CONFIG } from '../lib/config';
import { del, get, getToken, isNativeApp, patch, post } from '../lib/api';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

// ---------- Imagens do cofre (precisam de sessão, então vão por fetch e viram blob) ----------
function VaultImg({ verifId, kind, label, onOpen }: { verifId: string; kind: 'front' | 'back' | 'selfie'; label: string; onOpen: (src: string, label: string) => void }) {
  const { d } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let url = '';
    let dead = false;
    const headers: Record<string, string> = {};
    if (isNativeApp()) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`; headers['x-client'] = 'app'; }
    fetch(`${CONFIG.apiBaseUrl}/api/admin/verifications/${verifId}/${kind}`, { credentials: 'include', headers })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => { url = URL.createObjectURL(b); if (!dead) setSrc(url); })
      .catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [verifId, kind]);
  const box = { width: 140, height: 100, borderRadius: 10, background: 'var(--soft)', objectFit: 'cover' as const, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <figure style={{ margin: 0 }} className="stack gap-4">
      {err ? <span style={box} className="xs muted">{d.g.adm2.verif.failed}</span>
        : src ? <button type="button" onClick={() => onOpen(src, label)} style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}><img src={src} alt={label} style={box} /></button>
        : <span style={box} className="skeleton" />}
      <figcaption className="xs muted">{label}</figcaption>
    </figure>
  );
}

export function VerifImages({ id }: { id: string }) {
  const { d } = useI18n();
  const v = d.g.adm2.verif;
  const [big, setBig] = useState<{ src: string; label: string } | null>(null);
  return (
    <div className="stack gap-8">
      <div className="row wrap gap-12">
        <VaultImg verifId={id} kind="front" label={v.front} onOpen={(src, label) => setBig({ src, label })} />
        <VaultImg verifId={id} kind="back" label={v.back} onOpen={(src, label) => setBig({ src, label })} />
        <VaultImg verifId={id} kind="selfie" label={v.selfie} onOpen={(src, label) => setBig({ src, label })} />
      </div>
      <span className="xs muted">{v.hint}</span>
      {big && <Modal title={big.label} onClose={() => setBig(null)}><img src={big.src} alt={big.label} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12 }} /></Modal>}
    </div>
  );
}

// ---------- Usuários ----------
interface Row { id: string; name: string; email: string; role: string; verification: string; status: 'active' | 'suspended' | 'deleted'; createdAt: string }
interface Ficha {
  user: Row & { phone: string | null; city: string | null; lang: string; age: number | null; emailVerified: boolean; lastSeenAt: string | null; locked: boolean };
  stats: { bookingsAsClient: number; bookingsAsPartner: number; reportsAgainst: number; reportsMade: number; tickets: number; sessions: number };
  partner: { visible: boolean; photos: { approved: number; pending: number } } | null;
  verification: { status: string; inReview: boolean };
}

export function AdminUsers() {
  const { d, f, locale } = useI18n();
  const u = d.g.adm2.users;
  const { toast, fail } = useStore();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [ver, setVer] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const query = (offset: number) => `/admin/users?q=${encodeURIComponent(q.trim())}&limit=30&offset=${offset}${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}${ver ? `&verification=${ver}` : ''}`;
  useEffect(() => {
    const t = window.setTimeout(() => { get<{ items: Row[]; total: number }>(query(0)).then((r) => { setRows(r.items); setTotal(r.total); }).catch(fail); }, 250);
    return () => window.clearTimeout(t);
  }, [q, role, status, ver, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = () => get<{ items: Row[]; total: number }>(query(rows.length)).then((r) => { setRows((x) => [...x, ...r.items]); setTotal(r.total); }).catch(fail);

  const roleName = (r: string) => u.roles[r === 'partner' ? 'partner' : r === 'admin' ? 'admin' : 'client'];
  const stName = (s: string) => u.statuses[s as keyof typeof u.statuses] ?? s;
  const sel = (id: string, label: string, val: string, set: (v: string) => void, opts: [string, string][]) => (
    <div className="field" style={{ minWidth: 130 }}>
      <label htmlFor={id} className="xs">{label}</label>
      <select id={id} className="select" value={val} onChange={(e) => set(e.target.value)}>
        <option value="">{u.all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <div className="stack gap-12">
      <div className="row wrap gap-12" style={{ alignItems: 'flex-end' }}>
        <div className="search-inline" style={{ background: 'var(--white)', border: '1px solid var(--line)', maxWidth: 360, flex: 1, minWidth: 220 }}>
          <Icon name="search" size={18} stroke="var(--muted)" />
          <label htmlFor="uq" className="sr-only">{d.admin.searchUser}</label>
          <input id="uq" placeholder={d.admin.searchUser} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {sel('ur', u.role, role, setRole, [['client', u.roles.client], ['partner', u.roles.partner], ['admin', u.roles.admin]])}
        {sel('us', u.status, status, setStatus, [['active', u.statuses.active], ['suspended', u.statuses.suspended], ['deleted', u.statuses.deleted]])}
        {sel('uv', d.admin.thU.verified, ver, setVer, [['verified', u.identityOk], ['pending', u.identityPending], ['in_review', u.identityReview]])}
      </div>
      <span className="small muted">{f(u.total, { n: total })}</span>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{d.admin.thU.name}</th><th>{d.admin.thU.email}</th><th>{d.admin.thU.type}</th><th>{d.admin.thU.verified}</th><th>{d.admin.thU.status}</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="bold">{r.name}</td><td>{r.email}</td><td>{roleName(r.role)}</td>
                <td><span className={`badge ${r.verification === 'verified' ? 'badge-teal' : 'badge-warn'}`}>{r.verification === 'verified' ? d.admin.yes : r.verification === 'in_review' ? d.admin.uStatus.review : d.admin.no}</span></td>
                <td>{stName(r.status)}</td>
                <td><button className="btn btn-light btn-sm" onClick={() => setOpenId(r.id)}>{u.open}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length < total && <button className="btn btn-light" style={{ alignSelf: 'flex-start' }} onClick={() => void more()}>{u.more}</button>}
      {openId && <UserPanel id={openId} locale={locale} onClose={() => setOpenId(null)} changed={() => { setTick((n) => n + 1); }} toast={toast} fail={fail} />}
    </div>
  );
}

function UserPanel({ id, locale, onClose, changed, toast, fail }: { id: string; locale: string; onClose: () => void; changed: () => void; toast: (m: string, t?: 'ok' | 'warn') => void; fail: (e: unknown) => void }) {
  const { d, f } = useI18n();
  const u = d.g.adm2.users;
  const [fi, setFi] = useState<Ficha | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', lang: 'pt' });
  const [word, setWord] = useState('');
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    const r = await get<Ficha>(`/admin/users/${id}`);
    setFi(r);
    setForm({ name: r.user.name, email: r.user.email, phone: r.user.phone ?? '', city: r.user.city ?? '', lang: r.user.lang });
  }, [id]);
  useEffect(() => { void load().catch(fail); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok: string, warn = false) => {
    try { await fn(); toast(ok, warn ? 'warn' : 'ok'); changed(); await load(); } catch (e) { fail(e); }
  };
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '—');

  if (!fi) return <Modal title={u.detail} onClose={onClose}><div className="skeleton" style={{ height: 200, borderRadius: 16 }} /></Modal>;
  const { user: x, stats: s, partner: p } = fi;
  const gone = x.status === 'deleted';
  const isAdmin = x.role === 'admin';
  const stat = (l: string, v: number) => <div className="tile"><span className="xs muted">{l}</span><br /><strong>{v}</strong></div>;

  return (
    <Modal title={x.name} onClose={onClose}>
      <div className="stack gap-16" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="row wrap gap-8 small muted">
          <span>{u.roles[x.role === 'partner' ? 'partner' : x.role === 'admin' ? 'admin' : 'client']}</span>·<span>{u.statuses[x.status]}</span>
          {x.age != null && <><span>·</span><span>{f(u.age, { n: x.age })}</span></>}
          <span>·</span><span>{u.created}: {when(x.createdAt)}</span><span>·</span><span>{u.lastSeen}: {when(x.lastSeenAt)}</span>
        </div>
        {gone && <div className="notice notice-warn">{u.removed}</div>}
        {x.locked && <div className="notice notice-warn">{u.locked}</div>}
        <div className="dash-grid">
          {stat(u.stAsClient, s.bookingsAsClient)}{stat(u.stAsPartner, s.bookingsAsPartner)}{stat(u.stAgainst, s.reportsAgainst)}{stat(u.stMade, s.reportsMade)}{stat(u.stTickets, s.tickets)}{stat(u.stSessions, s.sessions)}
        </div>
        {p && <div className="small muted">{u.partner}: {p.visible ? u.visible : u.hidden} · {f(u.photos, { a: p.photos.approved, p: p.photos.pending })}</div>}

        {!gone && (
          <form className="stack gap-8" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await patch<{ changed: string[] }>(`/admin/users/${id}`, { name: form.name, email: form.email, phone: form.phone || null, city: form.city || null, lang: form.lang });
              if (!r.changed.length) throw new Error(u.nothing);
            }, u.saved);
          }}>
            {([['fName', 'name', 'text'], ['fEmail', 'email', 'email'], ['fPhone', 'phone', 'tel'], ['fCity', 'city', 'text']] as const).map(([lab, key, type]) => (
              <div className="field" key={key}>
                <label htmlFor={`uf-${key}`}>{u[lab]}</label>
                <input id={`uf-${key}`} type={type} className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
            <div className="field">
              <label htmlFor="uf-lang">{u.fLang}</label>
              <select id="uf-lang" className="select" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })}>
                {['pt', 'es', 'en', 'zh'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>{u.save}</button>
          </form>
        )}

        {!gone && (
          <div className="stack gap-8">
            <h3 className="h-sm">{u.actions}</h3>
            <div className="row wrap gap-8">
              <span className="small">{u.identity}: <strong>{x.verification === 'verified' ? u.identityOk : x.verification === 'in_review' ? u.identityReview : u.identityPending}</strong></span>
              {x.verification !== 'verified'
                ? <button className="btn btn-light btn-sm" onClick={() => void run(() => patch(`/admin/users/${id}`, { verification: 'verified' }), u.saved)}>{u.verify}</button>
                : <button className="btn btn-light btn-sm" onClick={() => void run(() => patch(`/admin/users/${id}`, { verification: 'pending' }), u.saved)}>{u.unverify}</button>}
            </div>
            <div className="row wrap gap-8">
              <span className="small">{u.emailOk}: <strong>{x.emailVerified ? d.admin.yes : d.admin.no}</strong></span>
              {!x.emailVerified && <button className="btn btn-light btn-sm" onClick={() => void run(() => patch(`/admin/users/${id}`, { emailVerified: true }), u.saved)}>{u.confirmEmail}</button>}
            </div>
            <div className="row wrap gap-8">
              <button className="btn btn-light btn-sm" onClick={() => void run(() => post(`/admin/users/${id}/send-reset`), u.resetSent)}>{u.sendReset}</button>
              <button className="btn btn-light btn-sm" onClick={() => void run(() => post(`/admin/users/${id}/revoke-sessions`), u.revoked)}>{u.revoke}</button>
              {!isAdmin && x.status === 'active' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post(`/admin/users/${id}/suspend`), d.admin.suspendedToast, true)}>{u.suspend}</button>}
              {x.status === 'suspended' && <button className="btn btn-light btn-sm" onClick={() => void run(() => post(`/admin/users/${id}/reinstate`), d.live.reinstate)}>{u.reinstate}</button>}
            </div>
          </div>
        )}

        {!gone && (
          <div className="stack gap-8 card card-pad" style={{ borderColor: 'var(--danger)' }}>
            <h3 className="h-sm" style={{ color: 'var(--danger)' }}>{u.danger}</h3>
            {isAdmin ? <span className="small muted">{u.adminProtected}</span> : (
              <>
                <strong className="small">{u.deleteTitle}</strong>
                <span className="small muted">{u.deleteText}</span>
                <div className="field"><label htmlFor="ud-r">{u.deleteReason}</label><input id="ud-r" className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
                <div className="field"><label htmlFor="ud-w">{u.deleteType}</label><input id="ud-w" className="input" value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} /></div>
                <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={word.trim().toUpperCase() !== u.deleteWord}
                  onClick={() => void run(async () => { await del(`/admin/users/${id}`, { confirm: true, reason: reason.trim() || undefined }); onClose(); }, u.deleted, true)}>{u.deleteBtn}</button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- Suporte ----------
interface Ticket { id: string; protocol: string; name: string | null; email: string | null; subject: string; message: string; status: string; bookingId: string | null; reply: string | null; repliedAt: string | null; createdAt: string }

export function AdminSupport({ onCount }: { onCount?: (n: number) => void }) {
  const { d, f, locale } = useI18n();
  const s = d.g.adm2.support;
  const { toast, fail } = useStore();
  const [st, setSt] = useState<'open' | 'answered' | 'closed' | 'all'>('open');
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const r = await get<{ items: Ticket[] }>(`/admin/support?status=${st}`);
    setItems(r.items);
    if (st === 'open') onCount?.(r.items.length);
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load().catch(fail); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const subj = (k: string) => s.subjects[k as keyof typeof s.subjects] ?? k;
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="stack gap-12">
      <h2 className="h-sm">{s.title}</h2>
      <div className="seg" role="tablist" style={{ maxWidth: 440 }}>
        {(['open', 'answered', 'closed', 'all'] as const).map((k) => <button key={k} role="tab" aria-selected={st === k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{s[k]}</button>)}
      </div>
      {!items ? <div className="skeleton" style={{ height: 120, borderRadius: 16 }} /> : items.length === 0 ? <div className="tile small muted">{s.empty}</div> : items.map((t) => (
        <div key={t.id} className="card card-pad stack gap-8">
          <div className="row wrap between gap-8">
            <strong>{subj(t.subject)} · {f(s.protocol, { p: t.protocol })}</strong>
            <span className="xs muted">{when(t.createdAt)}</span>
          </div>
          <span className="small muted">{f(s.from, { n: t.name ?? t.email ?? '—' })}{t.email && t.name ? ` · ${t.email}` : ''}{t.bookingId ? ` · ${f(s.booking, { id: t.bookingId.slice(0, 8) })}` : ''}</span>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.message}</p>
          {t.reply && <div className="tile small"><strong>{s.yourReply}</strong>{t.repliedAt && <span className="xs muted"> · {f(s.answeredOn, { d: when(t.repliedAt) })}</span>}<p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{t.reply}</p></div>}
          {t.status !== 'closed' && (
            <>
              <textarea className="textarea" aria-label={s.replyPh} placeholder={s.replyPh} value={text[t.id] ?? ''} onChange={(e) => setText({ ...text, [t.id]: e.target.value })} />
              <div className="row wrap gap-8">
                <button className="btn btn-primary btn-sm" disabled={(text[t.id] ?? '').trim().length < 2} onClick={async () => {
                  try {
                    const r = await post<{ emailSent: boolean }>(`/admin/support/${t.id}/reply`, { message: text[t.id].trim() });
                    toast(r.emailSent || !t.email ? s.sent : s.sentNoMail, r.emailSent || !t.email ? 'ok' : 'warn');
                    setText({ ...text, [t.id]: '' }); await load();
                  } catch (e) { fail(e); }
                }}>{s.send}</button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { try { await post(`/admin/support/${t.id}/close`); toast(s.closedToast); await load(); } catch (e) { fail(e); } }}>{s.close}</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Reembolsos manuais ----------
interface Refund { id: string; bookingId: string; client: string; email: string; refundCents: number; providerRef: string | null; createdAt: string }

export function AdminRefunds() {
  const { d, f, money } = useI18n();
  const r = d.g.adm2.refunds;
  const { toast, fail } = useStore();
  const [items, setItems] = useState<Refund[] | null>(null);
  const load = useCallback(async () => { setItems((await get<{ items: Refund[] }>('/admin/refunds')).items); }, []);
  useEffect(() => { void load().catch(fail); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items) return null;
  return (
    <div className="stack gap-12">
      <h2 className="h-sm">{r.title}</h2>
      <div className="notice notice-teal"><Icon name="wallet" /> {r.text}</div>
      {items.length === 0 ? <div className="tile small muted">{r.empty}</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{d.admin.thU.name}</th><th>{d.admin.thU.email}</th><th>{r.amount}</th><th /></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td className="bold">{x.client}</td>
                  <td className="small">{x.email}{x.providerRef && <div className="muted">{f(r.ref, { r: x.providerRef })}</div>}</td>
                  <td className="bold" style={{ whiteSpace: 'nowrap' }}>{money(x.refundCents / 100)}</td>
                  <td><button className="btn btn-primary btn-sm" onClick={async () => { try { await post(`/admin/refunds/${x.id}/done`); toast(r.doneToast); await load(); } catch (e) { fail(e); } }}>{r.done}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
