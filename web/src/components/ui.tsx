import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { useStore, type Role } from '../lib/store';
import { activityByKey, type ActivityKey } from '../data/activities';
import { useI18n } from '../i18n';

export { Logo } from './Brand';

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="ti"><Icon name={t.kind === 'ok' ? 'check' : 'alert'} size={18} stroke="#fff" width={2.6} /></span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { d } = useI18n();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between gap-12">
          <h2 className="display h-md">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={d.common.close}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, ready } = useStore();
  const loc = useLocation();
  if (!ready) return <div className="container" style={{ padding: '48px 20px' }} aria-busy="true"><div className="skeleton" style={{ height: 28, width: '40%', marginBottom: 16 }} /><div className="skeleton" style={{ height: 120 }} /></div>;
  if (!user) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (role && user.role !== role && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Nome traduzido de uma categoria. */
export function useActLabel() {
  const { d } = useI18n();
  return (k: ActivityKey) => d.act[k].label;
}

export function ActivityTag({ k }: { k: ActivityKey }) {
  const a = activityByKey(k);
  const label = useActLabel();
  return <span className="badge" style={{ background: a.soft, color: a.ink }}>{label(k)}</span>;
}

export function ActivityIcon({ k, size = 46, icon = 22, on = true }: { k: ActivityKey; size?: number; icon?: number; on?: boolean }) {
  const a = activityByKey(k);
  return (
    <span className="icon-box" style={{ width: size, height: size, borderRadius: size * 0.3, background: on ? a.color : a.soft, color: on ? '#fff' : a.ink }}>
      <Icon d={a.icon} size={icon} width={2.1} />
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  const { d, f } = useI18n();
  const n = Math.round(value);
  return <span className="stars" aria-label={f(d.common.starsAria, { n })}>{'★★★★★'.slice(0, n)}<span style={{ color: '#D9DCE5' }}>{'★★★★★'.slice(n)}</span></span>;
}

export function PageTitle({ title, sub, back }: { title: string; sub?: string; back?: string }) {
  const { d } = useI18n();
  return (
    <div className="stack gap-8" style={{ padding: '28px 0 20px' }}>
      {back && <Link to={back} className="row gap-4 small bold" style={{ textDecoration: 'none', color: 'var(--muted)' }}><Icon name="back" size={16} /> {d.common.back}</Link>}
      <h1 className="display h-lg">{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}

export function useTitle(t: string) {
  useEffect(() => { document.title = `${t} · RolêJunto`; }, [t]);
}
