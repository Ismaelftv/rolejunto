import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useTitle } from '../components/ui';
import { post, type ApiUser } from '../lib/api';
import { errorText, useStore } from '../lib/store';
import { useI18n } from '../i18n';
import { AuthShell } from './Auth';

// Confirmação do e-mail com o código de 6 dígitos enviado no cadastro (ou ao trocar o e-mail).
export default function ConfirmEmail() {
  const { d, f } = useI18n();
  const c = d.live.confirm;
  useTitle(c.title);
  const { user, setUser, toast } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || (user?.role === 'parceiro' ? '/painel' : '/explorar');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60); // espera para reenviar

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  if (!user) return <Navigate to={`/entrar?next=${encodeURIComponent('/confirmar-email')}`} replace />;
  if (user.emailVerified && !busy) return <Navigate to={next} replace />;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErr(c.errCode);
    setBusy(true); setErr('');
    try {
      const r = await post<{ user: ApiUser }>('/auth/verify-email', { code });
      setUser(r.user);
      toast(c.done);
      nav(next, { replace: true });
    } catch (ex) {
      setErr(errorText(d, ex));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setErr('');
    try { await post('/auth/verify-email/resend'); toast(c.sent); setWait(60); } catch (ex) { setErr(errorText(d, ex)); }
  };

  return (
    <AuthShell>
      <div className="stack gap-8">
        <span className="icon-box" style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="send" size={26} /></span>
        <h1 className="display h-md" style={{ fontSize: 36 }}>{c.title}</h1>
        <p className="muted">{f(c.sub, { email: user.email })}</p>
      </div>
      <form className="stack gap-16" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="cc">{c.code}</label>
          <input id="cc" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCode(v); setErr(''); }}
            style={{ fontSize: 26, letterSpacing: '0.5em', textAlign: 'center', fontWeight: 700 }} />
          <span className="hint">{c.hint}</span>
        </div>
        {err && <span className="error" role="alert">{err}</span>}
        <button className="btn btn-primary btn-sq btn-lg btn-block" disabled={busy || code.length !== 6} data-testid="confirm-email">{busy ? d.common.loading : c.submit}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={wait > 0} onClick={() => void resend()}>{wait > 0 ? f(c.resendIn, { s: wait }) : c.resend}</button>
      </form>
      <p className="small muted" style={{ textAlign: 'center' }}><Link to="/conta/editar" className="bold">{c.wrongEmail}</Link></p>
    </AuthShell>
  );
}
