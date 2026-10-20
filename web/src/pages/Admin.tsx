import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { PageTitle, useTitle } from '../components/ui';
import { useStore } from '../lib/store';
import { assetUrl, get, post } from '../lib/api';
import { useI18n } from '../i18n';
import AdminCoupons from './AdminCoupons';
import { AdminAudit, AdminBookings, AdminFinance, AdminReviews, AdminSystem, GrowthCharts, type HeldReview } from './AdminExtra';

// Painel administrativo ligado à API. Cada ação fica registrada no log de auditoria (quem fez, quando e por quê).

interface Metrics { activeUsers: number; bookingsToday: number; verificationQueue: number; openReports: number; urgentReports: number; pendingPhotos: number }
interface Verif { id: string; userId: string; name: string; role: string; age: number; docAge: number | null; matchScore: number | null; createdAt: string }
interface Report { id: string; targetId: string; targetName: string; reporterName: string; reporterId: string | null; reason: string; details: string; priority: 'high' | 'medium' | 'low'; status: string; createdAt: string }
interface Photo { id: string; url: string; partnerName: string; createdAt: string }
interface AdminUser { id: string; name: string; email: string; role: string; verification: string; status: 'active' | 'suspended' | 'deleted' }

const TABS = ['geral', 'financeiro', 'reservas', 'verif', 'denuncias', 'conteudo', 'avaliacoes', 'usuarios', 'cupons', 'historico', 'sistema'] as const;

// Motivos da API → posição em d.report.reasons
const REASON_IDX: Record<string, number> = { sexual: 0, abuse: 1, threat: 1, fake: 2, minor: 3, off_platform_payment: 4, other: 5 };

export default function Admin() {
  const { d, f, locale } = useI18n();
  useTitle(d.nav.admin);
  const { toast, fail } = useStore();
  const [tab, setTab] = useState<typeof TABS[number]>('geral');
  const [held, setHeld] = useState<HeldReview[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [verifs, setVerifs] = useState<Verif[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [uv, setUv] = useState(0);

  const ago = (iso: string) => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    if (Math.abs(min) < 60) return rtf.format(min, 'minute');
    if (Math.abs(min) < 1440) return rtf.format(Math.round(min / 60), 'hour');
    return rtf.format(Math.round(min / 1440), 'day');
  };
  const reasonLabel = (r: string) => (r === 'sos' ? 'SOS' : d.report.reasons[REASON_IDX[r] ?? 5]);
  const roleLabel = (r: string) => (r === 'partner' ? d.admin.roles.partner : r === 'admin' ? 'Admin' : d.admin.roles.client);

  const load = useCallback(async () => {
    const [m, v, r, p, h] = await Promise.all([
      get<Metrics>('/admin/metrics'),
      get<{ items: Verif[] }>('/admin/verifications'),
      get<{ items: Report[] }>('/admin/reports'),
      get<{ items: Photo[] }>('/admin/photos'),
      get<{ items: HeldReview[] }>('/admin/reviews'),
    ]);
    setMetrics(m); setVerifs(v.items); setReports(r.items); setPhotos(p.items); setHeld(h.items);
  }, []);
  useEffect(() => { void load().catch(fail); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'usuarios') return;
    const t = window.setTimeout(() => {
      get<{ items: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q.trim())}`).then((r) => setUsers(r.items)).catch(fail);
    }, 250);
    return () => window.clearTimeout(t);
  }, [tab, q, uv]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path: string, ok: string, warn = false, body: unknown = {}) => {
    try { await post(path, body); toast(ok, warn ? 'warn' : 'ok'); await load(); } catch (e) { fail(e); }
  };

  const tabLabel = (k: typeof TABS[number]) => {
    if (k === 'sistema') return d.live.sysAdm.tab;
    if (k === 'cupons') return d.g.adm.tab;
    if (k === 'reservas' || k === 'financeiro' || k === 'historico') return d.live.adm.tabs[k];
    if (k === 'avaliacoes') return f(d.live.adm.tabs.avaliacoes, { n: held.length });
    return f(d.admin.tabs[k], { n: k === 'verif' ? verifs.length : k === 'denuncias' ? reports.length : photos.length });
  };

  return (
    <div className="container">
      <PageTitle title={d.admin.title} sub={d.admin.sub} />
      <div className="seg seg-scroll" style={{ marginBottom: 16 }} role="tablist">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={(e) => { setTab(k); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}>{tabLabel(k)}</button>)}
      </div>

      {tab === 'geral' && (
        <div className="stack gap-16">
          <div className="dash-grid">
            <div className="stat"><span className="small muted bold">{d.admin.stats.active}</span><span className="v">{metrics?.activeUsers ?? '—'}</span></div>
            <div className="stat"><span className="small muted bold">{d.admin.stats.today}</span><span className="v">{metrics?.bookingsToday ?? '—'}</span></div>
            <div className="stat"><span className="small muted bold">{d.admin.stats.queue}</span><span className="v">{metrics?.verificationQueue ?? '—'}</span></div>
            <div className="stat"><span className="small muted bold">{d.admin.stats.open}</span><span className="v" style={{ color: metrics?.urgentReports ? 'var(--danger)' : undefined }}>{metrics?.openReports ?? '—'}</span></div>
          </div>
          <div className="notice notice-warn"><Icon name="alert" /> {d.admin.priorityNote}</div>
          <GrowthCharts />
        </div>
      )}
      {tab === 'reservas' && <AdminBookings />}
      {tab === 'financeiro' && <AdminFinance />}
      {tab === 'avaliacoes' && <AdminReviews items={held} reload={() => load().catch(fail)} />}
      {tab === 'historico' && <AdminAudit />}
      {tab === 'sistema' && <AdminSystem />}
      {tab === 'cupons' && <AdminCoupons />}

      {tab === 'verif' && (
        <div className="stack gap-12">
          {verifs.length === 0 && <div className="tile small muted">{d.live.adminEmpty}</div>}
          {verifs.map((v) => (
            <div key={v.id} className="card card-pad row wrap between gap-16">
              <div className="row gap-16">
                <div className="row gap-8">
                  <span style={{ width: 64, height: 44, borderRadius: 8, background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="id" stroke="var(--muted)" /></span>
                  <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="user" stroke="var(--muted)" /></span>
                </div>
                <div className="stack">
                  <strong>{v.name} · {roleLabel(v.role)}</strong>
                  <span className="small muted">{f(d.admin.sent, { t: ago(v.createdAt), n: v.docAge ?? v.age })}</span>
                  {v.matchScore !== null && <span className="small bold" style={{ color: v.matchScore >= 90 ? 'var(--teal)' : 'var(--danger)' }}>{f(d.admin.match, { n: v.matchScore })}</span>}
                </div>
              </div>
              <div className="row gap-8">
                <button className="btn btn-primary btn-sm" onClick={() => act(`/admin/verifications/${v.id}/approve`, f(d.admin.approvedToast, { name: v.name }))}>{d.admin.approve}</button>
                <button className="btn btn-light btn-sm" onClick={() => act(`/admin/verifications/${v.id}/reject`, f(d.admin.rejectedToast, { name: v.name }), true)}>{d.admin.reject}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'denuncias' && (
        reports.length === 0 ? <div className="tile small muted">{d.live.adminEmpty}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{d.admin.th.priority}</th><th>{d.admin.th.target}</th><th>{d.admin.th.reason}</th><th>{d.admin.th.by}</th><th>{d.admin.th.when}</th><th>{d.admin.th.action}</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td><span className={`badge ${r.priority === 'high' ? 'badge-danger' : 'badge-warn'}`}>{r.priority === 'high' ? d.admin.high : d.admin.medium}</span></td>
                    <td className="bold">{r.targetName}</td>
                    <td>{reasonLabel(r.reason)}{r.details && <div className="xs muted" style={{ maxWidth: 280 }}>{r.details}</div>}</td>
                    <td>{r.reporterName}</td><td>{ago(r.createdAt)}</td>
                    <td>
                      <div className="row gap-4">
                        <button className="btn btn-light btn-sm" onClick={() => act(`/admin/reports/${r.id}/action`, d.admin.warnedToast, false, { action: 'warn' })}>{d.admin.warn}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => act(`/admin/reports/${r.id}/action`, d.admin.suspendedToast, true, { action: 'suspend' })}>{d.admin.suspend}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => act(`/admin/reports/${r.id}/action`, d.admin.rStatus.arquivada, false, { action: 'archive' })}>{d.admin.archive}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'conteudo' && (
        <div className="stack gap-12">
          {photos.length === 0 && <div className="tile small muted">{d.admin.emptyQueue}</div>}
          {photos.map((c) => (
            <div key={c.id} className="card card-pad row wrap between gap-12">
              <div className="row gap-12">
                <img src={assetUrl(c.url)} alt="" width={72} height={72} style={{ borderRadius: 12, objectFit: 'cover', background: 'var(--soft)' }} />
                <div className="stack"><strong>{f(d.live.photoBy, { name: c.partnerName })}</strong><span className="xs muted">{ago(c.createdAt)}</span></div>
              </div>
              <div className="row gap-8">
                <button className="btn btn-primary btn-sm" onClick={() => act(`/admin/photos/${c.id}/approve`, d.admin.contentApproved)}>{d.admin.approve}</button>
                <button className="btn btn-danger btn-sm" onClick={() => act(`/admin/photos/${c.id}/reject`, d.admin.contentRemoved, true)}>{d.admin.reject}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'usuarios' && (
        <div className="stack gap-12">
          <div className="search-inline" style={{ background: 'var(--white)', border: '1px solid var(--line)', maxWidth: 420 }}>
            <Icon name="search" size={18} stroke="var(--muted)" />
            <label htmlFor="uq" className="sr-only">{d.admin.searchUser}</label>
            <input id="uq" placeholder={d.admin.searchUser} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{d.admin.thU.name}</th><th>{d.admin.thU.email}</th><th>{d.admin.thU.type}</th><th>{d.admin.thU.verified}</th><th>{d.admin.thU.status}</th><th>{d.admin.th.action}</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="bold">{u.name}</td><td>{u.email}</td><td>{roleLabel(u.role)}</td>
                    <td><span className={`badge ${u.verification === 'verified' ? 'badge-teal' : 'badge-warn'}`}>{u.verification === 'verified' ? d.admin.yes : u.verification === 'in_review' ? d.admin.uStatus.review : d.admin.no}</span></td>
                    <td>{u.status === 'active' ? d.admin.uStatus.active : u.status === 'suspended' ? d.live.suspended : d.live.removed}</td>
                    <td>
                      {u.role !== 'admin' && u.status === 'active' && <button className="btn btn-ghost btn-sm" onClick={() => act(`/admin/users/${u.id}/suspend`, d.admin.suspendedToast, true).then(() => setUv((n) => n + 1))}>{d.admin.suspend}</button>}
                      {u.status === 'suspended' && <button className="btn btn-light btn-sm" onClick={() => act(`/admin/users/${u.id}/reinstate`, d.live.reinstate).then(() => setUv((n) => n + 1))}>{d.live.reinstate}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
