// Abas extras do painel admin: gráficos de crescimento, reservas, financeiro, avaliações retidas e histórico de ações.
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { MiniChart } from '../components/MiniChart';
import type { ActivityKey } from '../data/activities';
import { get, post } from '../lib/api';
import { brDate, useStore } from '../lib/store';
import { useI18n } from '../i18n';

// Cores das séries (paleta categórica validada para daltonismo: azul e laranja)
const C1 = '#2a78d6';
const C2 = '#eb6834';

const useFmt = () => {
  const { locale, money } = useI18n();
  return {
    when: (iso: string) => new Date(iso).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
    cents: (c: number) => money(c / 100),
  };
};

// ---------- Visão geral: gráficos ----------
interface Day { date: string; clients: number; partners: number; bookings: number; completed: number; revenueCents: number }

export function GrowthCharts() {
  const { d, f, locale } = useI18n();
  const g = d.live.adm.growth;
  const { cents } = useFmt();
  const [days, setDays] = useState<Day[] | null>(null);
  useEffect(() => { get<{ series: Day[] }>('/admin/stats/growth?days=30').then((r) => setDays(r.series)).catch(() => setDays([])); }, []);
  if (!days) return <div className="skeleton" style={{ height: 260, borderRadius: 20 }} />;
  const labels = days.map((x) => x.date);
  const sum = (k: keyof Day) => days.reduce((s, x) => s + (x[k] as number), 0);
  const common = { labels, locale, tableLabel: g.table, dateLabel: g.date };
  return (
    <div className="stack gap-12">
      <h2 className="h-sm">{g.title}</h2>
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 12 }}>
        <MiniChart {...common} kind="bar" integer title={g.signups} sub={f(g.total, { n: sum('clients') + sum('partners') })}
          series={[{ key: 'c', label: g.clients, color: C1, values: days.map((x) => x.clients) }, { key: 'p', label: g.partners, color: C2, values: days.map((x) => x.partners) }]} />
        <MiniChart {...common} kind="bar" integer title={g.bookings} sub={f(g.total, { n: sum('bookings') })}
          series={[{ key: 'b', label: g.created, color: C1, values: days.map((x) => x.bookings) }, { key: 'k', label: g.completed, color: C2, values: days.map((x) => x.completed) }]} />
      </div>
      <MiniChart {...common} kind="bar" title={g.revenue} sub={cents(sum('revenueCents'))} format={(n) => cents(n)}
        series={[{ key: 'r', label: d.live.adm.fin.fees, color: C1, values: days.map((x) => x.revenueCents) }]} />
    </div>
  );
}

// ---------- Reservas ----------
interface ABooking { id: string; startsAt: string; activity: string; hours: number; place: string; totalCents: number; status: string; paymentStatus: string; clientName: string; partnerName: string }
const B_STATUS = ['requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'declined'] as const;
const B_MAP: Record<string, 'aguardando' | 'confirmada' | 'em_andamento' | 'concluida' | 'cancelada' | 'recusada'> = {
  requested: 'aguardando', accepted: 'confirmada', in_progress: 'em_andamento', completed: 'concluida', cancelled: 'cancelada', declined: 'recusada',
};
const B_CLS: Record<string, string> = { requested: 'badge-warn', accepted: 'badge-teal', in_progress: 'badge-ink', completed: 'badge-soft', cancelled: 'badge-danger', declined: 'badge-danger' };

export function AdminBookings() {
  const { d, hour } = useI18n();
  const b = d.live.adm.bk;
  const { cents } = useFmt();
  const { toast, fail } = useStore();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ABooking[] | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => {
      get<{ items: ABooking[] }>(`/admin/bookings?${new URLSearchParams({ ...(status ? { status } : {}), q: q.trim() })}`).then((r) => setItems(r.items)).catch(fail);
    }, 250);
    return () => window.clearTimeout(t);
  }, [status, q, v]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async (id: string) => {
    try { await post(`/admin/bookings/${id}/cancel`); toast(b.cancelled, 'warn'); setV((x) => x + 1); } catch (e) { fail(e); }
  };
  const when = (iso: string) => { const l = brDate(iso); return `${l.slice(8, 10)}/${l.slice(5, 7)} ${hour(l.slice(11, 16))}`; };

  return (
    <div className="stack gap-12">
      <div className="row wrap gap-8">
        <div className="search-inline" style={{ background: '#fff', border: '1px solid var(--line)', flex: '1 1 260px', maxWidth: 420 }}>
          <Icon name="search" size={18} stroke="var(--muted)" />
          <label htmlFor="bq" className="sr-only">{b.search}</label>
          <input id="bq" placeholder={b.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="bs" className="sr-only">{b.status}</label>
        <select id="bs" className="select" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{b.all}</option>
          {B_STATUS.map((s) => <option key={s} value={s}>{d.bookings.status[B_MAP[s]]}</option>)}
        </select>
      </div>
      {items === null ? <div className="skeleton" style={{ height: 200 }} /> : items.length === 0 ? <div className="tile small muted">{b.empty}</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{b.when}</th><th>{b.client}</th><th>{b.partner}</th><th>{b.program}</th><th>{b.total}</th><th>{b.status}</th><th>{b.payment}</th><th>{b.action}</th></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(x.startsAt)}</td>
                  <td className="bold">{x.clientName}</td>
                  <td>{x.partnerName}</td>
                  <td>{d.act[x.activity as ActivityKey]?.label ?? x.activity} · {x.hours} h<div className="xs muted" style={{ maxWidth: 220 }}>{x.place}</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{cents(x.totalCents)}</td>
                  <td><span className={`badge ${B_CLS[x.status]}`}>{d.bookings.status[B_MAP[x.status]]}</span></td>
                  <td className="small">{b.pay[x.paymentStatus as keyof typeof b.pay] ?? x.paymentStatus}</td>
                  <td>
                    {['requested', 'accepted', 'in_progress'].includes(x.status) && (
                      <details className="confirm-inline">
                        <summary className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>{b.cancel}</summary>
                        <div className="stack gap-8" style={{ marginTop: 8 }}>
                          <span className="xs bold">{b.cancelConfirm}</span>
                          <button className="btn btn-danger btn-sm" onClick={() => void cancel(x.id)}>{d.common.continue}</button>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Financeiro ----------
interface Finance {
  grossCents: number; feesCents: number; refundedCents: number; heldCents: number; owedCents: number;
  pendingPayouts: { partnerId: string; name: string; email: string; phone: string | null; bookingsCount: number; amountCents: number }[];
  recentPayouts: { id: string; name: string; amountCents: number; bookingsCount: number; note: string; createdAt: string }[];
}
interface APayment { id: string; createdAt: string; paidAt: string | null; status: string; method: 'pix' | 'card'; amountCents: number; refundedCents: number; clientName: string; partnerName: string }

export function AdminFinance() {
  const { d, f } = useI18n();
  const x = d.live.adm.fin;
  const { cents, when } = useFmt();
  const { toast, fail } = useStore();
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const [fin, setFin] = useState<Finance | null>(null);
  const [pays, setPays] = useState<APayment[]>([]);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([get<Finance>(`/admin/finance?period=${period}`), get<{ items: APayment[] }>('/admin/payments')]);
    setFin(a); setPays(b.items);
  }, [period]);
  useEffect(() => { void load().catch(fail); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const register = async (p: Finance['pendingPayouts'][number]) => {
    try {
      await post('/admin/payouts', { partnerId: p.partnerId });
      toast(f(x.registered, { v: cents(p.amountCents), name: p.name }));
      await load();
    } catch (e) { fail(e); }
  };

  if (!fin) return <div className="skeleton" style={{ height: 260, borderRadius: 20 }} />;
  return (
    <div className="stack gap-24">
      <div className="seg" role="tablist" style={{ maxWidth: 360 }}>
        {(['month', 'all'] as const).map((p) => <button key={p} role="tab" aria-selected={period === p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{x[p]}</button>)}
      </div>
      <div className="dash-grid">
        <div className="stat"><span className="small muted bold">{x.gross}</span><span className="v">{cents(fin.grossCents)}</span></div>
        <div className="stat"><span className="small muted bold">{x.fees}</span><span className="v" style={{ color: 'var(--teal)' }}>{cents(fin.feesCents)}</span></div>
        <div className="stat"><span className="small muted bold">{x.held}</span><span className="v">{cents(fin.heldCents)}</span></div>
        <div className="stat"><span className="small muted bold">{x.owed}</span><span className="v" style={{ color: fin.owedCents ? 'var(--accent)' : undefined }}>{cents(fin.owedCents)}</span></div>
      </div>
      {fin.refundedCents > 0 && <span className="small muted">{x.refunded}: <strong>{cents(fin.refundedCents)}</strong></span>}

      <div className="stack gap-12">
        <h2 className="h-sm">{x.pendingTitle}</h2>
        <div className="notice notice-teal"><Icon name="wallet" /> {x.pendingHint}</div>
        {fin.pendingPayouts.length === 0 ? <div className="tile small muted">{x.pendingEmpty}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{x.partner}</th><th>{x.contact}</th><th>{x.count}</th><th>{x.amount}</th><th /></tr></thead>
              <tbody>
                {fin.pendingPayouts.map((p) => (
                  <tr key={p.partnerId}>
                    <td className="bold">{p.name}</td>
                    <td className="small">{p.email}{p.phone && <div className="muted">{p.phone}</div>}</td>
                    <td>{p.bookingsCount}</td>
                    <td className="bold" style={{ whiteSpace: 'nowrap' }}>{cents(p.amountCents)}</td>
                    <td>
                      <details className="confirm-inline">
                        <summary className="btn btn-primary btn-sm">{x.register}</summary>
                        <div className="stack gap-8" style={{ marginTop: 8 }}>
                          <span className="xs bold">{f(x.confirm, { v: cents(p.amountCents) })}</span>
                          <button className="btn btn-dark btn-sm" onClick={() => void register(p)}>{d.common.continue}</button>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stack gap-12">
        <h2 className="h-sm">{x.doneTitle}</h2>
        {fin.recentPayouts.length === 0 ? <div className="tile small muted">{x.doneEmpty}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{x.date}</th><th>{x.partner}</th><th>{x.count}</th><th>{x.amount}</th></tr></thead>
              <tbody>{fin.recentPayouts.map((p) => <tr key={p.id}><td>{when(p.createdAt)}</td><td className="bold">{p.name}</td><td>{p.bookingsCount}</td><td>{cents(p.amountCents)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stack gap-12">
        <h2 className="h-sm">{x.paymentsTitle}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{x.date}</th><th>{x.client}</th><th>{x.partner}</th><th>{x.method}</th><th>{x.amount}</th><th>{x.status}</th></tr></thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(p.paidAt ?? p.createdAt)}</td>
                  <td className="bold">{p.clientName}</td><td>{p.partnerName}</td>
                  <td>{p.method === 'pix' ? 'Pix' : x.card}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{cents(p.amountCents)}{p.refundedCents > 0 && <div className="xs muted">−{cents(p.refundedCents)}</div>}</td>
                  <td><span className={`badge ${p.status === 'paid' ? 'badge-teal' : p.status === 'pending' ? 'badge-warn' : 'badge-soft'}`}>{x.pstatus[p.status as keyof typeof x.pstatus] ?? p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Avaliações retidas ----------
export interface HeldReview { id: string; rating: number; text: string; createdAt: string; authorName: string; targetName: string }

export function AdminReviews({ items, reload }: { items: HeldReview[]; reload: () => Promise<void> }) {
  const { d, f } = useI18n();
  const r = d.live.adm.rv;
  const { when } = useFmt();
  const { toast, fail } = useStore();
  const act = async (id: string, action: 'show' | 'delete') => {
    try { await post(`/admin/reviews/${id}/${action}`); toast(action === 'show' ? r.shown : r.removed, action === 'show' ? 'ok' : 'warn'); await reload(); } catch (e) { fail(e); }
  };
  if (!items.length) return <div className="tile small muted">{r.empty}</div>;
  return (
    <div className="stack gap-12">
      {items.map((x) => (
        <div key={x.id} className="card card-pad stack gap-8">
          <div className="row wrap between gap-8 small"><strong>{f(r.about, { a: x.authorName, t: x.targetName })}</strong><span className="muted">{when(x.createdAt)}</span></div>
          <span className="stars">{'★★★★★'.slice(0, x.rating)}<span style={{ color: '#D9DCE5' }}>{'★★★★★'.slice(x.rating)}</span></span>
          <p className="small tile">“{x.text}”</p>
          <div className="row gap-8">
            <button className="btn btn-light btn-sm" onClick={() => void act(x.id, 'show')}>{r.show}</button>
            <button className="btn btn-danger btn-sm" onClick={() => void act(x.id, 'delete')}>{r.remove}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Histórico de ações ----------
interface Log { id: string; action: string; createdAt: string; ip: string | null; targetType: string | null; targetId: string | null; actorName: string | null; targetName: string | null }
const GROUPS = ['user', 'booking', 'payment', 'payout', 'verification', 'report', 'photo', 'review', 'moderation'] as const;

export function AdminAudit() {
  const { d } = useI18n();
  const l = d.live.adm.log;
  const { when } = useFmt();
  const { fail } = useStore();
  const [group, setGroup] = useState('');
  const [items, setItems] = useState<Log[] | null>(null);
  useEffect(() => { get<{ items: Log[] }>(`/admin/audit${group ? `?action=${group}.` : ''}`).then((r) => setItems(r.items)).catch(fail); }, [group]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (a: string) => (l.actions as Record<string, string>)[a] ?? a;
  return (
    <div className="stack gap-12">
      <div className="row wrap gap-8">
        <label htmlFor="lg" className="sr-only">{l.filter}</label>
        <select id="lg" className="select" style={{ maxWidth: 240 }} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">{l.filter}: {l.all}</option>
          {GROUPS.map((g) => <option key={g} value={g}>{l.groups[g]}</option>)}
        </select>
      </div>
      {items === null ? <div className="skeleton" style={{ height: 200 }} /> : items.length === 0 ? <div className="tile small muted">{l.empty}</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{l.when}</th><th>{l.who}</th><th>{l.action}</th><th>{l.target}</th></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(x.createdAt)}</td>
                  <td className="bold">{x.actorName ?? l.system}{x.ip && <div className="xs muted" style={{ fontWeight: 400 }}>{x.ip}</div>}</td>
                  <td>{label(x.action)}</td>
                  <td className="small">{x.targetName || (x.targetId ? `${x.targetType ?? ''} ${x.targetId.slice(0, 8)}` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Sistema: e-mail, pagamentos e verificação ----------
type Problem = 'not_configured' | 'bad_user' | 'auth' | 'two_step' | 'blocked_port' | 'tls' | 'rejected' | 'unknown';
interface MailSt { mode: 'gmail' | 'smtp' | 'resend' | 'brevo' | 'console'; from: string | null; ok: boolean | null; problem: Problem | null; detail: string | null; checkedAt: string | null; lastSentAt: string | null; lastError: { at: string; to: string; problem: Problem; detail: string } | null }
interface SysInfo { env: string; email: MailSt; payments: { provider: string; webhookSecret: boolean }; verification: { provider: string; autoApprove: boolean } }

export function AdminSystem() {
  const { d, f } = useI18n();
  const y = d.live.sysAdm;
  const { when } = useFmt();
  const { user, toast, fail } = useStore();
  const [info, setInfo] = useState<SysInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [to, setTo] = useState(user?.email ?? '');
  const [sending, setSending] = useState(false);
  const load = useCallback(async (check = false) => {
    setChecking(check);
    try { setInfo(await get<SysInfo>(`/admin/system${check ? '?check=1' : ''}`)); } catch (e) { fail(e); } finally { setChecking(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true); }, [load]);

  const test = async () => {
    setSending(true);
    try {
      const r = await post<{ ok: boolean; to: string; status: MailSt }>('/admin/system/test-email', { to: to.trim() || undefined });
      setInfo((i) => (i ? { ...i, email: r.status } : i));
      if (r.ok) toast(f(y.testOk, { to: r.to })); else toast(y.testFail, 'warn');
    } catch (e) { fail(e); } finally { setSending(false); }
  };

  if (!info) return <div className="skeleton" style={{ height: 260, borderRadius: 20 }} />;
  const m = info.email;
  const state = m.mode === 'console' ? false : m.ok;
  const problem: Problem | null = m.mode === 'console' ? 'not_configured' : m.problem;
  const badge = (good: boolean | null) => (
    <span className={`badge ${good === true ? 'badge-teal' : good === false ? 'badge-danger' : 'badge-soft'}`}>{good === true ? y.ok : good === false ? y.fail : y.unchecked}</span>
  );

  return (
    <div className="stack gap-16" style={{ maxWidth: 820 }}>
      <div className="card card-pad stack gap-12" data-testid="sys-email">
        <div className="row wrap between gap-8">
          <div className="row gap-12">
            <span className="icon-box" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--soft)', color: 'var(--ink)' }}><Icon name="send" size={20} /></span>
            <div className="stack"><strong>{y.emailTitle}</strong><span className="small muted">{f(y.mode[m.mode], { u: m.from ?? '' })}</span></div>
          </div>
          <div className="row gap-8">{badge(state)}<button className="btn btn-light btn-sm" disabled={checking} onClick={() => void load(true)}>{checking ? y.checking : y.recheck}</button></div>
        </div>
        {problem && <div className="notice notice-warn"><Icon name="alert" /> <span>{y.problems[problem]}</span></div>}
        <div className="stack gap-4 small">
          {m.from && <span><span className="muted">{y.from}:</span> {m.from}</span>}
          {m.lastSentAt && <span><span className="muted">{y.lastSent}:</span> {when(m.lastSentAt)}</span>}
          {m.lastError && <span><span className="muted">{y.lastError}:</span> {when(m.lastError.at)} · {m.lastError.to}</span>}
          {m.detail && <details><summary className="muted bold" style={{ cursor: 'pointer' }}>{y.detail}</summary><code className="xs" style={{ wordBreak: 'break-all' }}>{m.detail}</code></details>}
        </div>
        {m.mode !== 'console' && (
          <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 260px' }}><label htmlFor="tmail">{y.testTo}</label><input id="tmail" type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <button className="btn btn-primary btn-sq" disabled={sending} onClick={() => void test()} data-testid="test-email">{y.testBtn}</button>
          </div>
        )}
        <div className="tile xs stack gap-4">
          <span className="muted bold">{y.cmd}</span>
          <code style={{ wordBreak: 'break-all' }}>docker compose exec api node dist/doctor.js {to || 'seuemail@gmail.com'}</code>
        </div>
      </div>

      <div className="card card-pad row wrap between gap-12">
        <div className="row gap-12">
          <span className="icon-box" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--soft)', color: 'var(--ink)' }}><Icon name="wallet" size={20} /></span>
          <div className="stack"><strong>{y.payTitle}</strong>
            <span className="small muted">{info.payments.provider === 'mock' ? y.payMock : y.payMp}{info.payments.provider !== 'mock' && !info.payments.webhookSecret ? ` ${y.payNoHook}` : ''}</span>
          </div>
        </div>
        {info.payments.provider !== 'mock' && badge(info.payments.webhookSecret)}
      </div>

      <div className="card card-pad row wrap between gap-12">
        <div className="row gap-12">
          <span className="icon-box" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--soft)', color: 'var(--ink)' }}><Icon name="id" size={20} /></span>
          <div className="stack"><strong>{y.verTitle}</strong><span className="small muted">{info.verification.autoApprove ? y.verAuto : y.verManual}</span></div>
        </div>
      </div>
    </div>
  );
}
