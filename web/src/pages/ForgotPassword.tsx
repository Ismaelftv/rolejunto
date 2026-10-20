import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useTitle } from '../components/ui';
import { useI18n } from '../i18n';
import { errorText, useStore } from '../lib/store';
import { post } from '../lib/api';
import { AuthShell } from './Auth';

// POST /api/auth/forgot envia o código por e-mail; POST /api/auth/reset valida o código e troca a senha.
export default function ForgotPassword() {
  const { d, f } = useI18n();
  useTitle(d.forgot.title);
  const { toast } = useStore();
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    try { await post('/auth/forgot', { email: email.trim() }); setErr(''); setStep('code'); toast(f(d.forgot.sent, { email: email.trim() })); }
    catch (e) { setErr(errorText(d, e)); }
    finally { setBusy(false); }
  };
  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr(d.auth.errEmail);
    void requestCode();
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErr(d.forgot.errCode);
    if (pass.length < 8) return setErr(d.auth.errPass8);
    if (pass !== pass2) return setErr(d.forgot.errMatch);
    setBusy(true);
    try { await post('/auth/reset', { email: email.trim(), code, password: pass }); setErr(''); setStep('done'); }
    catch (ex) { setErr(errorText(d, ex)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      {step !== 'done' && (
        <div className="stack gap-8">
          <Link to="/entrar" className="row gap-4 small bold" style={{ textDecoration: 'none', color: 'var(--muted)' }}><Icon name="back" size={16} /> {d.forgot.back}</Link>
          <h1 className="display h-md" style={{ fontSize: 36 }}>{d.forgot.title}</h1>
          <p className="muted">{step === 'email' ? d.forgot.sub : f(d.forgot.sent, { email })}</p>
        </div>
      )}

      {step === 'email' && (
        <form className="stack gap-16" onSubmit={sendCode} noValidate>
          <div className="field"><label htmlFor="fe">{d.forgot.email}</label><input id="fe" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {err && <span className="error" role="alert">{err}</span>}
          <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={busy}>{d.forgot.send}</button>
        </form>
      )}

      {step === 'code' && (
        <form className="stack gap-16" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor="fc">{d.forgot.code}</label>
            <input id="fc" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ fontSize: 26, letterSpacing: '0.5em', textAlign: 'center', fontWeight: 700 }} />
            <span className="hint">{d.live.forgotHint}</span>
          </div>
          <div className="field"><label htmlFor="fp">{d.forgot.newPass}</label><input id="fp" type="password" autoComplete="new-password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} /><span className="hint">{d.auth.passHint}</span></div>
          <div className="field"><label htmlFor="fp2">{d.forgot.confirm}</label><input id="fp2" type="password" autoComplete="new-password" className="input" value={pass2} onChange={(e) => setPass2(e.target.value)} /></div>
          {err && <span className="error" role="alert">{err}</span>}
          <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={busy}>{d.forgot.save}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void requestCode()}>{d.forgot.resend}</button>
        </form>
      )}

      {step === 'done' && (
        <div className="stack gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="icon-box" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--teal)', color: '#fff' }}><Icon name="lock" size={28} /></span>
          <h1 className="display h-md">{d.forgot.doneTitle}</h1>
          <p className="muted">{d.forgot.doneText}</p>
          <Link to="/entrar" className="btn btn-primary btn-sq btn-lg btn-block">{d.auth.enter}</Link>
        </div>
      )}
    </AuthShell>
  );
}
