import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Brand';
import { PersonCard } from '../components/PersonCard';
import { MyCoupons, ReferralCard, ThemePicker } from '../components/Growth';
import { PageTitle, useTitle } from '../components/ui';
import { usePartners } from '../lib/partners';
import { del, get } from '../lib/api';
import { errorText, useStore, type Verification } from '../lib/store';
import { LANGS, useI18n } from '../i18n';
import { useInstall } from '../lib/pwa';

const VER_CLS: Record<Verification, string> = { pendente: 'badge-warn', em_analise: 'badge-soft', verificado: 'badge-teal', recusado: 'badge-danger' };

export default function Account() {
  const { d, f, lang, setLang } = useI18n();
  useTitle(d.nav.myAccount);
  const { user, updateUser, logout, favorites, toast, fail } = useStore();
  const install = useInstall();
  const nav = useNavigate();
  const [contact, setContact] = useState(user?.trustedContact ?? { name: '', phone: '' });
  const [delPass, setDelPass] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delOk, setDelOk] = useState(false);
  const favs = usePartners(favorites);
  if (!user) return null;
  const v = d.account.ver[user.verification];

  const download = async () => {
    try {
      const data = await get<unknown>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rolejunto-meus-dados.json';
      a.click();
    } catch (e) { fail(e); }
  };
  const removeAccount = async () => {
    const noPass = user.hasPassword === false;
    if (noPass ? !delOk : !delPass) return setDelErr(noPass ? d.g.account.delConfirmNoPass : d.live.delPassword);
    try {
      await del('/me', noPass ? { confirm: true } : { password: delPass });
      await logout();
      toast(d.live.deleted, 'warn');
      nav('/');
    } catch (e) { setDelErr(errorText(d, e)); }
  };
  const save = (body: Record<string, unknown>, ok?: string) => updateUser(body).then(() => { if (ok) toast(ok); }).catch(fail);

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="row gap-16" style={{ paddingTop: 28 }}>
        <Link to="/conta/editar" aria-label={d.menu.edit} style={{ textDecoration: 'none' }}>
          {user.avatar ? <img src={user.avatar} alt="" className="avatar-lg" style={{ width: 72, height: 72, borderRadius: 22 }} /> : <span className="avatar-lg" style={{ width: 72, height: 72, borderRadius: 22, fontSize: 30 }}>{user.name.charAt(0).toUpperCase()}</span>}
        </Link>
        <div className="grow" style={{ minWidth: 0 }}><PageTitle title={f(d.account.hello, { name: user.name })} sub={user.email} /></div>
      </div>
      <div className="stack gap-16">
        {!user.emailVerified && (
          <div className="notice notice-warn" style={{ alignItems: 'center' }}>
            <Icon name="send" />
            <span className="grow"><strong>{d.live.confirm.badge}.</strong> {d.live.confirm.reminderText}</span>
            <Link to="/confirmar-email?next=%2Fconta" className="btn btn-dark btn-sm">{d.live.confirm.cta}</Link>
          </div>
        )}
        <div className="card card-pad row wrap between gap-16">
          <div className="row gap-12">
            <span className="icon-box" style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--teal-soft)', color: 'var(--teal)' }}><Icon name="id" /></span>
            <div className="stack"><span className="row wrap gap-8"><strong>{d.account.verifyTitle}</strong><span className={`badge ${VER_CLS[user.verification]}`}>{v.label}</span></span><span className="small muted">{v.text}</span></div>
          </div>
          {user.verification !== 'verificado' && <Link to="/verificacao" className="btn btn-dark btn-sm">{d.account.verifyNow}</Link>}
        </div>

        <nav className="card" style={{ padding: '4px 16px' }} aria-label={d.nav.account}>
          <div className="menu-list">
            {([['/conta/editar', 'user', d.menu.edit], ['/notificacoes', 'bell', d.menu.notifications], ['/conta/bloqueados', 'ban', d.menu.blocked], ['/conta/chamados', 'chat', d.g.adm2.mine.title], ['/ajuda', 'chat', d.menu.help]] as const).map(([to, ic, label]) => (
              <Link key={to} to={to}><Icon name={ic} size={20} stroke="var(--muted)" /> <span className="grow">{label}</span><Icon name="next" size={18} stroke="var(--muted)" /></Link>
            ))}
          </div>
        </nav>

        {(user.role === 'parceiro' || user.role === 'admin') && (
          <div className="row wrap gap-8">
            {user.role === 'parceiro' && <Link to="/painel" className="btn btn-primary btn-sq"><Icon name="grid" size={18} /> {d.account.partnerPanel}</Link>}
            {user.role === 'admin' && <Link to="/admin" className="btn btn-primary btn-sq"><Icon name="settings" size={18} /> {d.account.adminPanel}</Link>}
            {user.role === 'admin' && <Link to="/painel" className="btn btn-light btn-sq">{d.account.viewPartner}</Link>}
          </div>
        )}

        <div className="card card-pad row wrap between gap-16" style={{ background: 'var(--brand-ink)', color: 'var(--on-brand)', borderColor: 'var(--brand-ink)' }}>
          <div className="row gap-12" style={{ flex: '1 1 300px' }}>
            <LogoMark size={52} variant="coral" />
            <div className="stack"><strong>{d.account.installTitle}</strong><span className="small" style={{ color: 'var(--brand-muted)' }}>{install.installed ? d.account.installDone : install.canPrompt ? d.account.installText : install.ios ? d.account.installIos : d.account.installText}</span></div>
          </div>
          {!install.installed && (
            <button className="btn btn-primary btn-sm" onClick={async () => { if (install.canPrompt) await install.prompt(); else toast(d.account.installIos, 'warn'); }}>
              <Icon name="download" size={16} /> {d.account.installCta}
            </button>
          )}
        </div>

        {user.role === 'cliente' && <ReferralCard />}
        {user.role === 'cliente' && <MyCoupons />}

        <form className="card card-pad stack gap-12" onSubmit={(e) => { e.preventDefault(); void save({ trustedContact: contact.phone.trim() ? { name: contact.name.trim(), phone: contact.phone.trim() } : null }, d.account.contactSaved); }}>
          <div className="stack"><h2 className="h-sm">{d.account.contactTitle}</h2><span className="small muted">{d.account.contactText}</span></div>
          <div className="grid-2">
            <div className="field"><label htmlFor="cn">{d.account.name}</label><input id="cn" className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="cp">{d.account.phone}</label><input id="cp" className="input" inputMode="tel" placeholder="(11) 90000-0000" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
          </div>
          <button className="btn btn-dark btn-sq" style={{ alignSelf: 'flex-start' }}>{d.account.saveContact}</button>
        </form>

        <div className="card card-pad stack gap-12">
          <h2 className="h-sm">{d.common.language}</h2>
          <div className="row wrap gap-8">
            {LANGS.map((l) => (
              <button key={l.code} className="chip" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}
                style={lang === l.code ? { background: 'var(--ink)', color: 'var(--white)' } : { background: 'var(--soft)' }}>
                <span aria-hidden style={{ fontSize: 18 }}>{l.flag}</span> {l.name}
              </button>
            ))}
          </div>
        </div>

        <ThemePicker />

        <div className="card card-pad stack gap-12">
          <h2 className="h-sm">{d.account.notifTitle}</h2>
          {(['email', 'push', 'promos'] as const).map((k) => (
            <label key={k} className="check"><input type="checkbox" checked={user.notifications[k]} onChange={(e) => { void save({ notifications: { ...user.notifications, [k]: e.target.checked } }); }} /> {d.account.notif[k]}</label>
          ))}
        </div>

        <div className="stack gap-12">
          <h2 className="h-sm">{d.account.favTitle}</h2>
          {favs.length === 0 ? <div className="tile small muted">{d.account.favEmpty}</div> : <div className="person-grid">{favs.map((p) => <PersonCard key={p.id} p={p} />)}</div>}
        </div>

        <div className="card card-pad stack gap-12">
          <div className="stack"><h2 className="h-sm">{d.account.privacyTitle}</h2><span className="small muted">{d.account.privacyText}</span></div>
          <div className="row wrap gap-8">
            <button className="btn btn-light btn-sm" onClick={download}><Icon name="download" size={16} /> {d.account.download}</button>
            <Link to="/privacidade" className="btn btn-ghost btn-sm">{d.account.policy}</Link>
            <details className="confirm-inline">
              <summary className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}><Icon name="trash" size={16} /> {d.account.del}</summary>
              <div className="row wrap gap-8" style={{ marginTop: 8 }}>
                <span className="small bold">{d.account.delConfirm}</span>
                {user.hasPassword === false ? (
                  <label className="check"><input type="checkbox" checked={delOk} onChange={(e) => { setDelOk(e.target.checked); setDelErr(''); }} /> {d.g.account.delConfirmNoPass}</label>
                ) : (
                  <>
                    <label htmlFor="delpw" className="sr-only">{d.live.delPassword}</label>
                    <input id="delpw" type="password" className="input" autoComplete="current-password" placeholder={d.live.delPassword} value={delPass} onChange={(e) => { setDelPass(e.target.value); setDelErr(''); }} style={{ maxWidth: 260 }} />
                  </>
                )}
                <button className="btn btn-danger btn-sm" onClick={removeAccount}>{d.account.del}</button>
                {delErr && <span className="error" role="alert" style={{ width: '100%' }}>{delErr}</span>}
              </div>
            </details>
          </div>
        </div>

        <button className="btn btn-light btn-sq" style={{ alignSelf: 'flex-start' }} onClick={async () => { await logout(); nav('/'); }}><Icon name="logout" size={18} /> {d.account.logout}</button>
      </div>
    </div>
  );
}
