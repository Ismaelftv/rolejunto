import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

// Símbolo RolêJunto: um pin de localização (o rolê, o lugar) com duas pessoas lado a lado (junto).
// Variantes: 'ink' (caixa escura, uso principal), 'coral' (caixa coral, para fundos escuros), 'outline' (só o pin, sem caixa).
export const PIN_PATH = 'M22.45 39.04 L13.79 28.04 A13 13 0 1 1 34.21 28.04 L25.55 39.04 Q24 41 22.45 39.04 Z';
export const DOTS: [number, number][] = [[19.3, 20.3], [28.7, 20.3]];
export const DOT_R = 3.8;

const COLORS = {
  ink: { bg: '#121826', pin: '#D9381E', dot: '#FFFFFF' },
  coral: { bg: '#D9381E', pin: '#121826', dot: '#FFFFFF' },
  outline: { bg: 'transparent', pin: '#D9381E', dot: '#FFFFFF' },
} as const;

export function LogoMark({ size = 40, variant = 'ink', title }: { size?: number; variant?: 'ink' | 'coral' | 'outline'; title?: string }) {
  const c = COLORS[variant];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: '0 0 auto', display: 'block' }}>
      {variant !== 'outline' && <rect width="48" height="48" rx="13" fill={c.bg} />}
      <path d={PIN_PATH} fill={c.pin} />
      {DOTS.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r={DOT_R} fill={c.dot} />)}
    </svg>
  );
}

export function Wordmark({ dark = false, size = 28 }: { dark?: boolean; size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size, color: dark ? '#FFFFFF' : 'var(--ink)' }}>
      rolê<span style={{ color: dark ? '#FF5B3D' : 'var(--accent)' }}>junto</span>
    </span>
  );
}

/** Logo completa (símbolo + logotipo). Mantém o mesmo lugar e tamanho do logotipo anterior. */
export function Logo({ to = '/', dark = false, size = 28 }: { to?: string; dark?: boolean; size?: number }) {
  const { d } = useI18n();
  return (
    <Link to={to} className="logo" aria-label={d.nav.home}>
      <LogoMark size={Math.round(size * 1.25)} variant={dark ? 'coral' : 'ink'} />
      <Wordmark dark={dark} size={size} />
    </Link>
  );
}

// Conceitos alternativos (exibidos na página /marca)
export function AltMarkRoute({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="13" fill="#121826" />
      <path d="M13 15 H27 a4.5 4.5 0 0 1 0 9 H24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 24 H21 a4.5 4.5 0 0 0 0 9 H35" fill="none" stroke="#D9381E" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="15" r="4.6" fill="#fff" /><circle cx="35" cy="33" r="4.6" fill="#D9381E" />
    </svg>
  );
}

export function AltMarkJ({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="0.5" y="0.5" width="47" height="47" rx="13" fill="#fff" stroke="#E6E8EF" />
      <path d="M14 13 H31 V27 a8 8 0 0 1 -16 0" fill="none" stroke="#121826" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="13" r="4.6" fill="#D9381E" /><circle cx="15" cy="27" r="4.6" fill="#D9381E" />
    </svg>
  );
}

/** SVG em texto, para download na página da marca. */
export const markSvgString = (variant: 'ink' | 'coral') => {
  const c = COLORS[variant];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="13" fill="${c.bg}"/><path d="${PIN_PATH}" fill="${c.pin}"/>${DOTS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${c.dot}"/>`).join('')}</svg>`;
};
