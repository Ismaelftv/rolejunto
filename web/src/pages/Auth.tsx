import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Brand';
import { useTitle } from '../components/ui';
import { CONFIG } from '../lib/config';
import { errorText, useStore, type Role } from '../lib/store';
import { ApiError } from '../lib/api';
import { LangSelect, useI18n } from '../i18n';

export function AuthShell({ children }: { children: ReactNode }) {
  const { d } = useI18n();
  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <div className="row between gap-12"><Logo dark /><LangSelect dark /></div>
        <div className="stack gap-16">
          <h2 className="display h-lg">{d.auth.sideTitle}</h2>
          <p style={{ color: '#C9CEDB', maxWidth: 420 }}>{d.auth.sideText}</p>
        </div>
        <div className="stack gap-8 small" style={{ color: '#C9CEDB' }}>
          {(['shield', 'lock', 'sos'] as const).map((ic, i) => (
            <span key={ic} className="row gap-8"><Icon name={ic} stroke="var(--teal-light)" size={18} /> {d.auth.side[i]}</span>
          ))}
        </div>
      </aside>
      <div className="auth-form">
        <div className="stack gap-24">
          <div className="only-mobile row between gap-12"><Logo /><LangSelect /></div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { d } = useI18n();
  useTitle(d.auth.enter);
  const { login } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr(d.auth.errEmail);
    if (!pass) return setErr(d.auth.errPass);
    setErr(''); setBusy(true);
    try {
      const u = await login(email.trim(), pass);
      nav(params.get('next') || (u.role === 'parceiro' ? '/painel' : u.role === 'admin' ? '/admin' : '/explorar'), { replace: true });
    } catch (ex) {
      setErr(errorText(d, ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="stack gap-8"><h1 className="display h-md" style={{ fontSize: 36 }}>{d.auth.welcome}</h1><p className="muted">{d.auth.loginSub}</p></div>
      <form className="stack gap-16" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="em">{d.auth.email}</label><input id="em" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">{d.auth.password}</label><input id="pw" type="password" autoComplete="current-password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} /></div>
        {err && <span className="error" role="alert">{err}</span>}
        <button className="btn btn-primary btn-sq btn-lg btn-block" data-testid="login-submit" disabled={busy}>{busy ? d.common.loading : d.auth.enter}</button>
        <Link to="/recuperar-senha" className="small bold" style={{ textAlign: 'center' }}>{d.auth.forgot}</Link>
      </form>
      <p className="small muted" style={{ textAlign: 'center' }}>{d.auth.noAccount} <Link to={`/cadastro${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="bold">{d.auth.create}</Link></p>
    </AuthShell>
  );
}

function ageFrom(date: string) {
  const b = new Date(date);
  if (isNaN(b.getTime())) return -1;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

export function Signup() {
  const { d, lang } = useI18n();
  useTitle(d.auth.signupTitle);
  const { signup } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [fm, setF] = useState({ name: '', email: '', pass: '', birth: '', role: (params.get('tipo') === 'parceiro' ? 'parceiro' : 'cliente') as Role, terms: false, privacy: false });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof fm, v: string | boolean) => setF({ ...fm, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (fm.name.trim().length < 2) er.name = d.auth.errName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fm.email)) er.email = d.auth.errEmail2;
    if (fm.pass.length < 8) er.pass = d.auth.errPass8;
    const age = ageFrom(fm.birth);
    if (age < 0) er.birth = d.auth.errBirth;
    else if (age < CONFIG.minAge) er.birth = d.auth.errMinor;
    if (!fm.terms) er.terms = d.auth.errTerms;
    if (!fm.privacy) er.privacy = d.auth.errPrivacy;
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await signup({ name: fm.name.trim(), email: fm.email.trim(), password: fm.pass, role: fm.role, birthDate: fm.birth, lang });
      const next = params.get('next');
      const verify = `/verificacao${next ? `?next=${encodeURIComponent(next)}` : ''}`;
      nav(`/confirmar-email?next=${encodeURIComponent(verify)}`, { replace: true });
    } catch (ex) {
      const code = ex instanceof ApiError ? ex.code : '';
      const field = code === 'email_taken' ? 'email' : code === 'underage' || code === 'invalid_birth_date' ? 'birth' : 'form';
      setErrs({ [field]: errorText(d, ex) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="stack gap-8"><h1 className="display h-md" style={{ fontSize: 36 }}>{d.auth.signupTitle}</h1><p className="muted">{d.auth.signupSub}</p></div>
      <form className="stack gap-16" onSubmit={submit} noValidate>
        <div className="grid-2">
          <label className={`radio-card ${fm.role === 'cliente' ? 'on' : ''}`}><input type="radio" name="tp" checked={fm.role === 'cliente'} onChange={() => set('role', 'cliente')} /><span className="small bold">{d.auth.wantCompany}</span></label>
          <label className={`radio-card ${fm.role === 'parceiro' ? 'on' : ''}`}><input type="radio" name="tp" checked={fm.role === 'parceiro'} onChange={() => set('role', 'parceiro')} /><span className="small bold">{d.auth.wantPartner}</span></label>
        </div>
        <div className="field"><label htmlFor="nm">{d.auth.name}</label><input id="nm" className="input" autoComplete="given-name" value={fm.name} onChange={(e) => set('name', e.target.value)} />{errs.name && <span className="error">{errs.name}</span>}</div>
        <div className="field"><label htmlFor="em2">{d.auth.email}</label><input id="em2" type="email" className="input" autoComplete="email" value={fm.email} onChange={(e) => set('email', e.target.value)} />{errs.email && <span className="error">{errs.email}</span>}</div>
        <div className="field"><label htmlFor="pw2">{d.auth.password}</label><input id="pw2" type="password" className="input" autoComplete="new-password" value={fm.pass} onChange={(e) => set('pass', e.target.value)} /><span className="hint">{d.auth.passHint}</span>{errs.pass && <span className="error">{errs.pass}</span>}</div>
        <div className="field"><label htmlFor="bd">{d.auth.birth}</label><input id="bd" type="date" className="input" value={fm.birth} onChange={(e) => set('birth', e.target.value)} />{errs.birth && <span className="error">{errs.birth}</span>}</div>
        <label className="check"><input type="checkbox" checked={fm.terms} onChange={(e) => set('terms', e.target.checked)} /><span>{d.auth.termsA} <Link to="/termos">{d.auth.termsLink}</Link> {d.auth.termsAnd} <Link to="/diretrizes">{d.auth.guidelinesLink}</Link>{d.auth.termsB} <strong>{d.auth.exclusively}</strong>.</span></label>
        {errs.terms && <span className="error">{errs.terms}</span>}
        <label className="check"><input type="checkbox" checked={fm.privacy} onChange={(e) => set('privacy', e.target.checked)} /><span>{d.auth.privacyA} <Link to="/privacidade">{d.auth.privacyLink}</Link>.</span></label>
        {errs.privacy && <span className="error">{errs.privacy}</span>}
        {errs.form && <span className="error" role="alert">{errs.form}</span>}
        <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={busy}>{busy ? d.common.loading : d.common.continue}</button>
      </form>
      <p className="small muted" style={{ textAlign: 'center' }}>{d.auth.haveAccount} <Link to="/entrar" className="bold">{d.auth.enter}</Link></p>
    </AuthShell>
  );
}
