// Painel admin → Cupons: criar campanhas, ativar/desativar e acompanhar o uso.
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { couponLabel } from '../components/Growth';
import { get, post } from '../lib/api';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

interface Coupon { id: string; code: string; kind: 'percent' | 'fixed'; value: number; maxDiscountCents: number | null; minTotalCents: number; maxUses: number | null; usesCount: number; perUser: number; validUntil: string | null; active: boolean; createdAt: string }
interface Res { items: Coupon[]; stats: { redemptions: number; discountCents: number; referralCoupons: number } }

const empty = { code: '', kind: 'percent' as 'percent' | 'fixed', value: '10', maxDiscount: '', minTotal: '', maxUses: '', perUser: '1', validUntil: '' };
const cents = (v: string) => (v.trim() ? Math.round(Number(v.replace(',', '.')) * 100) : null);

export default function AdminCoupons() {
  const { d, f, money, locale } = useI18n();
  const x = d.g.adm;
  const { toast, fail } = useStore();
  const [data, setData] = useState<Res | null>(null);
  const [fm, setFm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get<Res>('/admin/coupons').then(setData), []);
  useEffect(() => { void load().catch(fail); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof fm, v: string) => setFm({ ...fm, [k]: v });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const value = fm.kind === 'percent' ? Math.round(Number(fm.value)) : cents(fm.value) ?? 0;
      const r = await post<{ coupon: Coupon }>('/admin/coupons', {
        code: fm.code.trim(), kind: fm.kind, value,
        maxDiscountCents: fm.kind === 'percent' ? cents(fm.maxDiscount) : null,
        minTotalCents: cents(fm.minTotal) ?? 0,
        maxUses: fm.maxUses.trim() ? Math.round(Number(fm.maxUses)) : null,
        perUser: Math.max(1, Math.round(Number(fm.perUser) || 1)),
        validUntil: fm.validUntil ? new Date(`${fm.validUntil}T23:59:59-03:00`).toISOString() : null,
      });
      toast(f(x.created, { code: r.coupon.code }));
      setFm(empty);
      await load();
    } catch (ex) { fail(ex); } finally { setBusy(false); }
  };
  const toggle = async (c: Coupon) => { try { await post(`/admin/coupons/${c.id}/toggle`); await load(); } catch (e) { fail(e); } };

  return (
    <div className="stack gap-24">
      {data && (
        <div className="dash-grid">
          <div className="stat"><span className="small muted bold">{x.redemptions}</span><span className="v">{data.stats.redemptions}</span></div>
          <div className="stat"><span className="small muted bold">{x.discounts}</span><span className="v">{money(data.stats.discountCents / 100)}</span></div>
          <div className="stat"><span className="small muted bold">{x.referral}</span><span className="v">{data.stats.referralCoupons}</span></div>
        </div>
      )}
      <form className="card card-pad stack gap-16" onSubmit={create}>
        <h2 className="h-sm">{x.newTitle}</h2>
        <div className="notice notice-teal small"><Icon name="wallet" size={18} /> {x.hint}</div>
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
          <div className="field"><label htmlFor="cc">{x.code}</label><input id="cc" className="input" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_\-]+" style={{ textTransform: 'uppercase' }} value={fm.code} onChange={(e) => set('code', e.target.value)} placeholder="BEMVINDO10" /></div>
          <div className="field"><label htmlFor="ck">{x.kind}</label><select id="ck" className="select" value={fm.kind} onChange={(e) => set('kind', e.target.value)}><option value="percent">{x.percent}</option><option value="fixed">{x.fixed}</option></select></div>
          <div className="field"><label htmlFor="cv">{x.value}</label><input id="cv" className="input" required inputMode="decimal" value={fm.value} onChange={(e) => set('value', e.target.value)} /></div>
          {fm.kind === 'percent' && <div className="field"><label htmlFor="cm">{x.maxDiscount} <span className="muted">({x.optional})</span></label><input id="cm" className="input" inputMode="decimal" value={fm.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} /></div>}
          <div className="field"><label htmlFor="cmin">{x.minTotal} <span className="muted">({x.optional})</span></label><input id="cmin" className="input" inputMode="decimal" value={fm.minTotal} onChange={(e) => set('minTotal', e.target.value)} /></div>
          <div className="field"><label htmlFor="cu">{x.maxUses} <span className="muted">({x.optional})</span></label><input id="cu" className="input" inputMode="numeric" value={fm.maxUses} onChange={(e) => set('maxUses', e.target.value)} /></div>
          <div className="field"><label htmlFor="cpu">{x.perUser}</label><input id="cpu" className="input" inputMode="numeric" value={fm.perUser} onChange={(e) => set('perUser', e.target.value)} /></div>
          <div className="field"><label htmlFor="cvu">{x.validUntil} <span className="muted">({x.optional})</span></label><input id="cvu" type="date" className="input" value={fm.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></div>
        </div>
        <button className="btn btn-primary btn-sq" style={{ alignSelf: 'flex-start' }} disabled={busy}><Icon name="plus" size={18} /> {x.create}</button>
      </form>

      {!data ? <div className="skeleton" style={{ height: 160, borderRadius: 20 }} /> : data.items.length === 0 ? <div className="tile small muted">{x.empty}</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{x.code}</th><th>{x.value}</th><th>{x.uses}</th><th>{x.validUntil}</th><th /></tr></thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} style={c.active ? undefined : { opacity: 0.6 }}>
                  <td><code className="bold">{c.code}</code> <span className={`badge ${c.active ? 'badge-teal' : 'badge-soft'}`}>{c.active ? x.active : x.inactive}</span></td>
                  <td className="small">{couponLabel(c, d, f, money)}{c.minTotalCents ? <div className="xs muted">{f(d.g.coupon.min, { v: money(c.minTotalCents / 100) })}</div> : null}</td>
                  <td>{c.usesCount} / {c.maxUses ?? x.unlimited}</td>
                  <td className="small">{c.validUntil ? new Date(c.validUntil).toLocaleDateString(locale) : '—'}</td>
                  <td><button className="btn btn-light btn-sm" onClick={() => void toggle(c)}>{c.active ? x.off : x.on}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
