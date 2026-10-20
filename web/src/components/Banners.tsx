import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

const KEY = 'rolejunto:cookies';

/** Aviso de cookies (LGPD). Guarda a escolha no aparelho. */
export function CookieBar() {
  const { d } = useI18n();
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(KEY); } catch { return false; } });
  if (!show) return null;
  const choose = (v: 'all' | 'essential') => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } setShow(false); };
  return (
    <div className="cookie-bar" role="region" aria-label="Cookies">
      <span className="small">{d.cookies.text} <Link to="/privacidade" style={{ color: 'var(--teal-light)', fontWeight: 700 }}>{d.cookies.more}</Link></span>
      <div className="row wrap gap-8">
        <button className="btn btn-primary btn-sm" onClick={() => choose('all')}>{d.cookies.accept}</button>
        <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }} onClick={() => choose('essential')}>{d.cookies.essential}</button>
      </div>
    </div>
  );
}

/** Aviso quando o aparelho fica sem internet. */
export function OfflineBar() {
  const { d } = useI18n();
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="offline-bar" role="status">{d.offline}</div>;
}
