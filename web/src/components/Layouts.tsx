import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Logo } from './Brand';
import { useStore } from '../lib/store';
import { LangSelect, useI18n } from '../i18n';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function SiteFooter() {
  const { d, f } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container inner">
        <div className="stack gap-12" style={{ maxWidth: 320 }}>
          <Logo />
          <p className="muted small">{d.footer.tagline}</p>
        </div>
        <nav aria-label="Footer">
          <Link to="/explorar">{d.nav.explore}</Link>
          <Link to="/seja-parceiro">{d.nav.partner}</Link>
          <Link to="/seguranca">{d.footer.safetyCenter}</Link>
          <Link to="/diretrizes">{d.footer.guidelines}</Link>
          <Link to="/termos">{d.footer.terms}</Link>
          <Link to="/privacidade">{d.footer.privacy}</Link>
          <Link to="/marca">{d.nav.brand}</Link>
        </nav>
        <p className="muted small" style={{ width: '100%' }}>{f(d.footer.rights, { y: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}

export function SiteLayout() {
  const { user } = useStore();
  const { d } = useI18n();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <ScrollTop />
      <header className="site-header">
        <div className="container inner">
          <Logo />
          <nav className="site-nav" aria-label="Main">
            <Link to="/explorar">{d.nav.explore}</Link>
            <Link to="/sobre#como">{d.nav.how}</Link>
            <Link to="/seguranca">{d.nav.safety}</Link>
            <Link to="/seja-parceiro">{d.nav.partner}</Link>
            <LangSelect />
            {user ? (
              <Link to="/explorar" className="btn btn-dark btn-sm">{d.nav.openApp}</Link>
            ) : (
              <>
                <Link to="/entrar">{d.nav.login}</Link>
                <Link to="/cadastro" className="btn btn-dark btn-sm">{d.nav.signup}</Link>
              </>
            )}
          </nav>
          <div className="row gap-8 only-mobile">
            <LangSelect />
            <button className="icon-btn menu-btn" aria-label={open ? d.nav.closeMenu : d.nav.openMenu} aria-expanded={open} onClick={() => setOpen(!open)}>
              <Icon name={open ? 'x' : 'menu'} />
            </button>
          </div>
        </div>
        <div className={`mobile-menu ${open ? 'open' : ''}`}>
          <Link to="/explorar">{d.nav.explore}</Link>
          <Link to="/sobre#como">{d.nav.how}</Link>
          <Link to="/seguranca">{d.nav.safety}</Link>
          <Link to="/seja-parceiro">{d.nav.partner}</Link>
          {user ? <Link to="/conta">{d.nav.myAccount}</Link> : <><Link to="/entrar">{d.nav.login}</Link><Link to="/cadastro" className="btn btn-primary" style={{ marginTop: 8 }}>{d.nav.signup}</Link></>}
        </div>
      </header>
      <main><Outlet /></main>
      <SiteFooter />
    </>
  );
}

const CLIENT_TABS: { to: string; key: 'explore' | 'bookings' | 'messages' | 'account'; icon: IconName }[] = [
  { to: '/explorar', key: 'explore', icon: 'compass' },
  { to: '/reservas', key: 'bookings', icon: 'calendar' },
  { to: '/mensagens', key: 'messages', icon: 'chat' },
  { to: '/conta', key: 'account', icon: 'user' },
];

export function AppLayout() {
  const { user } = useStore();
  const { d } = useI18n();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const pending = useStore().unread;
  return (
    <div className={`app-shell ${pathname.startsWith('/parceiro/') ? 'is-profile' : ''}`}>
      <ScrollTop />
      <header className="app-top">
        <div className="container inner">
          <Logo to="/" />
          <nav className="app-tabs" aria-label="App">
            {CLIENT_TABS.map((t) => (
              <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={t.icon} size={18} /> {d.nav[t.key]}
              </NavLink>
            ))}
          </nav>
          <div className="row gap-8">
            {user?.role === 'parceiro' && <Link to="/painel" className="btn btn-light btn-sm only-desktop">{d.nav.partnerPanel}</Link>}
            {user?.role === 'admin' && <Link to="/admin" className="btn btn-light btn-sm only-desktop">{d.nav.admin}</Link>}
            <LangSelect />
            <button className="icon-btn" aria-label={d.nav.notifications} onClick={() => nav('/notificacoes')}>
              <Icon name="bell" />
              {pending > 0 && <span style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', border: '2px solid #fff' }} />}
            </button>
            {!user && <Link to="/entrar" className="btn btn-dark btn-sm">{d.nav.login}</Link>}
          </div>
        </div>
      </header>
      <main className="app-main"><Outlet /></main>
      <nav className="bottom-nav" aria-label="App">
        {CLIENT_TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={t.icon} size={22} /> {d.nav[t.key]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
