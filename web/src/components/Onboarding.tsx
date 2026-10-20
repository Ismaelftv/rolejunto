// Telas de boas-vindas: aparecem só no primeiro uso (para quem ainda não entrou), com opção de pular.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { LogoMark } from './Brand';
import { useStore } from '../lib/store';
import { LangSelect, useI18n } from '../i18n';

const KEY = 'rolejunto:onboarded';
const SKIP_PATHS = ['/termos', '/privacidade', '/diretrizes', '/seguranca', '/marca', '/completar-cadastro', '/recuperar-senha'];
const ART: { bg: string; icon?: IconName }[] = [
  { bg: '#D9381E' },
  { bg: '#0B6B61', icon: 'shield' },
  { bg: '#6D28D9', icon: 'lock' },
  { bg: '#B45309', icon: 'sos' },
];

const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };

export default function Onboarding() {
  const { d } = useI18n();
  const { ready, user } = useStore();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ready || user || seen() || SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    setOpen(true);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) btn.current?.focus(); }, [open, i]);

  if (!open) return null;
  const slides = d.g.onboarding.slides;
  const last = i === slides.length - 1;
  const close = (to?: string) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
    if (to) nav(to);
  };
  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));
  const s = slides[i];
  const art = ART[i];

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-labelledby="onb-t"
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'Escape') close(); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); touch.current = null; }}>
      <div className="onb-top">
        <LangSelect dark compact />
        <button className="onb-skip" onClick={() => close()}>{d.g.onboarding.skip}</button>
      </div>
      <div className="onb-body onb-slide" key={i}>
        <div className="onb-art" style={{ background: art.bg }} aria-hidden>
          {art.icon ? <Icon name={art.icon} size={96} width={1.6} /> : <LogoMark size={120} variant="ink" />}
        </div>
        <h1 id="onb-t" className="display">{s.title}</h1>
        <p>{s.text}</p>
      </div>
      <div>
        <div className="onb-dots" role="tablist">
          {slides.map((_, k) => <span key={k} className={k === i ? 'on' : ''} role="tab" aria-selected={k === i} aria-label={`${k + 1}/${slides.length}`} onClick={() => go(k)} />)}
        </div>
        <button ref={btn} className="btn btn-primary btn-sq btn-lg btn-block" style={{ maxWidth: 460, margin: '0 auto', display: 'flex' }} onClick={() => (last ? close('/explorar') : go(i + 1))}>
          {last ? d.g.onboarding.start : d.g.onboarding.next}
        </button>
      </div>
    </div>
  );
}
