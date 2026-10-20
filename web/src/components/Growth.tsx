// Indique um amigo, meus cupons e aparência (tema).
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { get } from '../lib/api';
import { useStore } from '../lib/store';
import { useTheme, type ThemePref } from '../lib/theme';
import { useI18n } from '../i18n';

interface Referral { code: string; link: string; invited: number; rewards: number; rewardCents: number }
export interface MyCoupon { id: string; code: string; kind: 'percent' | 'fixed'; value: number; maxDiscountCents: number | null; minTotalCents: number; validUntil: string | null }

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ReferralCard() {
  const { d, f, money } = useI18n();
  const { toast } = useStore();
  const [r, setR] = useState<Referral | null>(null);
  useEffect(() => { void get<Referral>('/me/referral').then(setR).catch(() => {}); }, []);
  if (!r || !r.rewardCents) return null;
  const v = money(r.rewardCents / 100);
  const share = async () => {
    const text = f(d.g.referral.shareText, { v });
    if (navigator.share) { try { await navigator.share({ title: 'RolêJunto', text, url: r.link }); return; } catch { /* cancelado */ } }
    if (await copy(`${text} ${r.link}`)) toast(d.g.referral.copied);
  };
  return (
    <section className="card card-pad stack gap-16 ref-card" aria-labelledby="ref-t">
      <div className="row gap-12">
        <span className="icon-box" style={{ width: 48, height: 48, borderRadius: 14, background: '#FF5B3D', color: '#fff', flex: '0 0 auto' }}><Icon name="gift" /></span>
        <div className="stack"><h2 id="ref-t" className="h-sm">{f(d.g.referral.title, { v })}</h2><span className="small muted">{f(d.g.referral.text, { v })}</span></div>
      </div>
      <div className="row wrap gap-12" style={{ alignItems: 'center' }}>
        <span className="stack gap-4"><span className="xs muted bold">{d.g.referral.code}</span><span className="ref-code">{r.code}</span></span>
        <div className="row wrap gap-8" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-light btn-sm" onClick={async () => { if (await copy(r.link)) toast(d.g.referral.copied); }}><Icon name="copy" size={16} /> {d.g.referral.copy}</button>
          <button className="btn btn-primary btn-sm" onClick={() => void share()}><Icon name="share" size={16} /> {d.g.referral.share}</button>
        </div>
      </div>
      {(r.invited > 0 || r.rewards > 0) && <span className="small muted">{f(d.g.referral.stats, { n: r.invited, r: r.rewards })}</span>}
    </section>
  );
}

export function couponLabel(c: Pick<MyCoupon, 'kind' | 'value' | 'maxDiscountCents'>, d: ReturnType<typeof useI18n>['d'], f: ReturnType<typeof useI18n>['f'], money: (n: number) => string) {
  const main = c.kind === 'percent' ? f(d.g.coupon.pct, { n: c.value }) : f(d.g.coupon.off, { v: money(c.value / 100) });
  return c.kind === 'percent' && c.maxDiscountCents ? `${main} (${f(d.g.coupon.upTo, { v: money(c.maxDiscountCents / 100) })})` : main;
}

export function MyCoupons() {
  const { d, f, money, locale } = useI18n();
  const { toast } = useStore();
  const [items, setItems] = useState<MyCoupon[] | null>(null);
  useEffect(() => { void get<{ items: MyCoupon[] }>('/me/coupons').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  return (
    <section className="card card-pad stack gap-12" aria-labelledby="cp-t">
      <h2 id="cp-t" className="h-sm row gap-8"><Icon name="ticket" size={20} /> {d.g.coupon.mine}</h2>
      {items === null ? <div className="skeleton" style={{ height: 56, borderRadius: 16 }} /> : items.length === 0 ? <div className="tile small muted">{d.g.coupon.mineEmpty}</div> : items.map((c) => (
        <div key={c.id} className="coupon-chip">
          <div className="stack grow" style={{ minWidth: 0 }}>
            <code>{c.code}</code>
            <span className="small">{couponLabel(c, d, f, money)}</span>
            <span className="xs muted">
              {[c.minTotalCents ? f(d.g.coupon.min, { v: money(c.minTotalCents / 100) }) : '', c.validUntil ? f(d.g.coupon.until, { d: new Date(c.validUntil).toLocaleDateString(locale) }) : ''].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button className="btn btn-light btn-sm" onClick={async () => { if (await copy(c.code)) toast(d.g.coupon.copied); }}><Icon name="copy" size={16} /> {d.g.coupon.copy}</button>
        </div>
      ))}
    </section>
  );
}

export function ThemePicker() {
  const { d } = useI18n();
  const { pref, setPref } = useTheme();
  const opts: [ThemePref, 'phone' | 'sun' | 'moon'][] = [['auto', 'phone'], ['light', 'sun'], ['dark', 'moon']];
  return (
    <section className="card card-pad stack gap-12" aria-labelledby="th-t">
      <h2 id="th-t" className="h-sm">{d.g.theme.title}</h2>
      <div className="seg theme-seg" role="radiogroup" aria-labelledby="th-t" style={{ maxWidth: 420 }}>
        {opts.map(([k, ic]) => (
          <button key={k} role="radio" aria-checked={pref === k} className={pref === k ? 'on' : ''} onClick={() => setPref(k)}>
            <Icon name={ic} size={16} /> {d.g.theme[k]}
          </button>
        ))}
      </div>
    </section>
  );
}
