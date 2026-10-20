// Modo escuro: "auto" segue o aparelho; "light" e "dark" fixam a escolha (guardada no aparelho).
import { useEffect, useState } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'rolejunto:theme';
const listeners = new Set<(p: ThemePref) => void>();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch { /* ignore */ }
  return 'auto';
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'auto' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0C1018' : '#121826');
  // barra de status do app Android/iOS
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, { setStyle?: (o: object) => Promise<void>; setBackgroundColor?: (o: object) => Promise<void> }> } }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    const sb = cap.Plugins?.StatusBar;
    void sb?.setStyle?.({ style: 'DARK' }).catch(() => {});
    void sb?.setBackgroundColor?.({ color: dark ? '#0C1018' : '#121826' }).catch(() => {});
  }
}

export function setThemePref(p: ThemePref) {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* ignore */ }
  applyTheme(p);
  listeners.forEach((fn) => fn(p));
}

export function initTheme() {
  applyTheme();
  media?.addEventListener?.('change', () => { if (getThemePref() === 'auto') applyTheme('auto'); });
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => { listeners.add(setPref); return () => { listeners.delete(setPref); }; }, []);
  return { pref, setPref: setThemePref };
}
