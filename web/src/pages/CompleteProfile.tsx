// Primeiro login com Google/Apple: a pessoa confirma nome, data de nascimento (18+), tipo de conta e aceita os termos.
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTitle } from '../components/ui';
import { CONFIG } from '../lib/config';
import { post, ApiError, type ApiUser } from '../lib/api';
import { clearRef, errorText, readRef, useStore, type Role } from '../lib/store';
import { useI18n } from '../i18n';
import { AuthShell, ageFrom } from './Auth';

export default function CompleteProfile() {
  const { d, f, lang } = useI18n();
  useTitle(d.g.complete.title);
  const st = useLocation().state as { ticket?: string; email?: string; name?: string; next?: string | null } | null;
  const { adoptSession } = useStore();
  const nav = useNavigate();
  const [fm, setF] = useState({ name: st?.name ?? '', birth: '', role: 'cliente' as Role, terms: false, privacy: false });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!st?.ticket) return <Navigate to="/entrar" replace />;
  const set = (k: keyof typeof fm, v: string | boolean) => setF({ ...fm, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (fm.name.trim().length < 2) er.name = d.auth.errName;
    const age = ageFrom(fm.birth);
    if (age < 0) er.birth = d.auth.errBirth;
    else if (age < CONFIG.minAge) er.birth = d.auth.errMinor;
    if (!fm.terms) er.terms = d.auth.errTerms;
    if (!fm.privacy) er.privacy = d.auth.errPrivacy;
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await post<{ user: ApiUser }>('/auth/oauth/complete', {
        ticket: st.ticket, name: fm.name.trim(), birthDate: fm.birth, role: fm.role === 'parceiro' ? 'partner' : 'client', lang,
        acceptTerms: true, privacyConsent: true, ref: readRef(),
      });
      clearRef();
      const u = await adoptSession(r.user);
      nav(u.role === 'parceiro' ? '/verificacao?next=%2Fpainel' : `/verificacao${st.next ? `?next=${encodeURIComponent(st.next)}` : ''}`, { replace: true });
    } catch (ex) {
      const code = ex instanceof ApiError ? ex.code : '';
      if (code === 'oauth_ticket_invalid') { setErrs({ form: d.g.complete.expired }); return; }
      setErrs({ [code === 'underage' || code === 'invalid_birth_date' ? 'birth' : 'form']: errorText(d, ex) });
    } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="stack gap-8"><h1 className="display h-md" style={{ fontSize: 36 }}>{d.g.complete.title}</h1><p className="muted">{f(d.g.complete.sub, { email: st.email ?? '' })}</p></div>
      <form className="stack gap-16" onSubmit={submit} noValidate>
        <div className="grid-2">
          <label className={`radio-card ${fm.role === 'cliente' ? 'on' : ''}`}><input type="radio" name="tp" checked={fm.role === 'cliente'} onChange={() => set('role', 'cliente')} /><span className="small bold">{d.auth.wantCompany}</span></label>
          <label className={`radio-card ${fm.role === 'parceiro' ? 'on' : ''}`}><input type="radio" name="tp" checked={fm.role === 'parceiro'} onChange={() => set('role', 'parceiro')} /><span className="small bold">{d.auth.wantPartner}</span></label>
        </div>
        <div className="field"><label htmlFor="nm">{d.auth.name}</label><input id="nm" className="input" autoComplete="given-name" value={fm.name} onChange={(e) => set('name', e.target.value)} />{errs.name && <span className="error">{errs.name}</span>}</div>
        <div className="field"><label htmlFor="bd">{d.auth.birth}</label><input id="bd" type="date" className="input" value={fm.birth} onChange={(e) => set('birth', e.target.value)} />{errs.birth && <span className="error">{errs.birth}</span>}</div>
        <label className="check"><input type="checkbox" checked={fm.terms} onChange={(e) => set('terms', e.target.checked)} /><span>{d.auth.termsA} <Link to="/termos">{d.auth.termsLink}</Link> {d.auth.termsAnd} <Link to="/diretrizes">{d.auth.guidelinesLink}</Link>{d.auth.termsB} <strong>{d.auth.exclusively}</strong>.</span></label>
        {errs.terms && <span className="error">{errs.terms}</span>}
        <label className="check"><input type="checkbox" checked={fm.privacy} onChange={(e) => set('privacy', e.target.checked)} /><span>{d.auth.privacyA} <Link to="/privacidade">{d.auth.privacyLink}</Link>.</span></label>
        {errs.privacy && <span className="error">{errs.privacy}</span>}
        {errs.form && <span className="error" role="alert">{errs.form}</span>}
        <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={busy}>{busy ? d.common.loading : d.g.complete.cta}</button>
      </form>
    </AuthShell>
  );
}
