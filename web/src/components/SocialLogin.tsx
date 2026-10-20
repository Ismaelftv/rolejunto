// Botões "Continuar com Google / Apple". Só aparecem quando a API tem os IDs configurados.
// O provedor devolve um ID token (JWT); a API confere a assinatura e cria a sessão.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, isNativeApp, post, type ApiUser } from '../lib/api';
import { errorText, useStore } from '../lib/store';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';

export interface PublicConfig { googleClientId: string | null; appleClientId: string | null; referralRewardCents: number; requirePartnerPhoto: boolean; cardEnabled?: boolean }
let cfgPromise: Promise<PublicConfig> | null = null;
export const publicConfig = () => (cfgPromise ??= get<PublicConfig>('/public-config').catch(() => { cfgPromise = null; return { googleClientId: null, appleClientId: null, referralRewardCents: 0, requirePartnerPhoto: true, cardEnabled: true }; }));

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = () => ok(); s.onerror = () => { scripts.delete(src); fail(new Error('script')); };
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src)!;
}

type GoogleId = { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
type AppleId = { auth: { init: (o: object) => void; signIn: () => Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }> } };

const GIS_LOCALE: Record<string, string> = { pt: 'pt-BR', es: 'es', en: 'en', zh: 'zh-CN' };

export function SocialLogin({ next }: { next?: string | null }) {
  const { d, lang } = useI18n();
  const { pref } = useTheme();
  const { adoptSession } = useStore();
  const nav = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const gRef = useRef<HTMLDivElement>(null);
  const native = isNativeApp();

  useEffect(() => { void publicConfig().then(setCfg); }, []);

  const finish = async (provider: 'google' | 'apple', idToken: string, name?: string) => {
    setBusy(true); setErr('');
    try {
      const r = await post<{ user?: ApiUser; needsProfile?: boolean; ticket?: string; email?: string; name?: string | null }>('/auth/oauth', { provider, idToken, ...(name ? { name } : {}) });
      if (r.needsProfile && r.ticket) {
        nav('/completar-cadastro', { state: { ticket: r.ticket, email: r.email, name: r.name ?? name ?? '', next } });
        return;
      }
      const u = await adoptSession(r.user!);
      nav(next || (u.role === 'parceiro' ? '/painel' : u.role === 'admin' ? '/admin' : '/explorar'), { replace: true });
    } catch (e) { setErr(errorText(d, e)); } finally { setBusy(false); }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Google Identity Services desenha o próprio botão (exigência do Google)
  useEffect(() => {
    if (native || !cfg?.googleClientId || !gRef.current) return;
    let alive = true;
    loadScript('https://accounts.google.com/gsi/client').then(() => {
      const g = (window as unknown as { google?: GoogleId }).google;
      if (!alive || !g || !gRef.current) return;
      g.accounts.id.initialize({ client_id: cfg.googleClientId, callback: (resp: { credential: string }) => void finishRef.current('google', resp.credential), ux_mode: 'popup', use_fedcm_for_prompt: true });
      gRef.current.innerHTML = '';
      const dark = document.documentElement.dataset.theme === 'dark';
      g.accounts.id.renderButton(gRef.current, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(400, gRef.current.offsetWidth || 320), locale: GIS_LOCALE[lang] });
    }).catch(() => setErr(d.g.social.failed));
    return () => { alive = false; };
  }, [cfg?.googleClientId, lang, pref, native]); // eslint-disable-line react-hooks/exhaustive-deps

  const apple = async () => {
    if (!cfg?.appleClientId) return;
    setErr('');
    try {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
      const A = (window as unknown as { AppleID?: AppleId }).AppleID!;
      A.auth.init({ clientId: cfg.appleClientId, scope: 'name email', redirectURI: `${window.location.origin}/entrar`, usePopup: true });
      const r = await A.auth.signIn();
      const n = r.user?.name ? [r.user.name.firstName, r.user.name.lastName].filter(Boolean).join(' ') : undefined;
      await finish('apple', r.authorization.id_token, n);
    } catch (e) {
      if ((e as { error?: string })?.error === 'popup_closed_by_user') return;
      setErr(d.g.social.failed);
    }
  };

  if (!cfg || (!cfg.googleClientId && !cfg.appleClientId)) return null;
  if (native) return <p className="xs muted" style={{ textAlign: 'center' }}>{d.g.social.appHint}</p>;
  return (
    <div className="stack gap-12" aria-busy={busy}>
      <div className="or-line">{d.g.social.or}</div>
      {cfg.googleClientId && <div ref={gRef} className="gsi-slot" data-testid="google-btn" />}
      {cfg.appleClientId && (
        <button type="button" className="btn-social apple" onClick={() => void apple()} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>
          {d.g.social.apple}
        </button>
      )}
      {err && <span className="error" role="alert">{err}</span>}
    </div>
  );
}
