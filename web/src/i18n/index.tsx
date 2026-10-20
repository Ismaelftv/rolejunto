import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import pt from './pt';
import es from './es';
import en from './en';
import zh from './zh';
import ptX from './extra/pt';
import esX from './extra/es';
import enX from './extra/en';
import zhX from './extra/zh';
import ptL from './live/pt';
import esL from './live/es';
import enL from './live/en';
import zhL from './live/zh';
import type { Dict, Lang } from './types';

export type { Dict, Lang };

export const LANGS: { code: Lang; flag: string; name: string; short: string; locale: string }[] = [
  { code: 'pt', flag: '🇧🇷', name: 'Português', short: 'PT', locale: 'pt-BR' },
  { code: 'es', flag: '🇪🇸', name: 'Español', short: 'ES', locale: 'es-ES' },
  { code: 'en', flag: '🇺🇸', name: 'English', short: 'EN', locale: 'en-US' },
  { code: 'zh', flag: '🇨🇳', name: '中文', short: '中文', locale: 'zh-CN' },
];

const DICTS: Record<Lang, Dict> = { pt: { ...pt, ...ptX, ...ptL }, es: { ...es, ...esX, ...esL }, en: { ...en, ...enX, ...enL }, zh: { ...zh, ...zhX, ...zhL } };
const KEY = 'rolejunto:lang';

/** Troca {variáveis} no texto. */
export function fill(s: string, v?: Record<string, string | number>) {
  if (!v) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? String(v[k]) : `{${k}}`));
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  d: Dict;
  f: typeof fill;
  locale: string;
  money: (n: number) => string;
  /** Rótulo do dia: Hoje, Amanhã ou dia da semana abreviado no idioma atual. */
  dayLabel: (offset: number) => string;
  /** Dia da semana abreviado de uma data AAAA-MM-DD. */
  weekday: (iso: string) => string;
  /** "19:00" → "19h" (pt/es) ou "19:00" (en/zh). */
  hour: (hhmm: string) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY) as Lang | null;
    if (saved && DICTS[saved]) return saved;
  } catch { /* sem armazenamento */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'pt').slice(0, 2);
  return (['pt', 'es', 'en', 'zh'] as Lang[]).includes(nav as Lang) ? (nav as Lang) : 'pt';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const meta = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    document.documentElement.lang = meta.locale;
    document.documentElement.dataset.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  }, [lang, meta.locale]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const value = useMemo<I18n>(() => {
    const d = DICTS[lang];
    const nf = new Intl.NumberFormat(meta.locale, { style: 'currency', currency: 'BRL', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const wd = new Intl.DateTimeFormat(meta.locale, { weekday: 'short' });
    return {
      lang, setLang, d, f: fill, locale: meta.locale,
      money: (n) => nf.format(n),
      weekday: (iso) => {
        const s = wd.format(new Date(`${iso}T12:00:00`)).replace('.', '');
        return s.charAt(0).toUpperCase() + s.slice(1);
      },
      hour: (hhmm) => {
        if (!/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
        if (lang === 'en' || lang === 'zh') return hhmm;
        const [h, m] = hhmm.split(':');
        return `${Number(h)}h${m === '00' ? '' : m}`;
      },
      dayLabel: (offset) => {
        if (offset === 0) return d.common.today;
        if (offset === 1) return d.common.tomorrow;
        const dt = new Date();
        dt.setDate(dt.getDate() + offset);
        const s = wd.format(dt).replace('.', '');
        return s.charAt(0).toUpperCase() + s.slice(1);
      },
    };
  }, [lang, meta.locale, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n fora do I18nProvider');
  return v;
}

/** Seletor de idioma reutilizável (cabeçalho do site, do app e login). */
export function LangSelect({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const { lang, setLang, d } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={`lang ${dark ? 'lang-dark' : ''} ${compact ? 'lang-compact' : ''}`} ref={ref}>
      <button type="button" className="lang-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${d.common.language}: ${cur.name}`} onClick={() => setOpen(!open)}>
        <span className="lang-flag" aria-hidden>{cur.flag}</span>
        <span className="lang-code">{cur.short}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="lang-menu" role="listbox" aria-label={d.common.language}>
          {LANGS.map((l) => (
            <li key={l.code}>
              <button type="button" role="option" aria-selected={l.code === lang} className={l.code === lang ? 'on' : ''}
                onClick={() => { setLang(l.code); setOpen(false); }}>
                <span className="lang-flag" aria-hidden>{l.flag}</span>
                <span className="grow">{l.name}</span>
                {l.code === lang && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
