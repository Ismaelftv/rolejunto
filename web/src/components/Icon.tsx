const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 1 0 14a7 7 0 1 1 0-14z M20 20l-3.5-3.5',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 7.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8 M10 20a2 2 0 0 0 4 0',
  check: 'M5 12l5 5L20 7',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4',
  lock: 'M6 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z M8 10V7a4 4 0 0 1 8 0v3',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  flag: 'M5 21V4h11l-1.5 4L16 12H5',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  compass: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M15.5 8.5l-2 5-5 2 2-5z',
  calendar: 'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M8 3v4 M16 3v4 M4 10h16',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  user: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M4 21c0-4 3.6-7 8-7s8 3 8 7',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  x: 'M6 6l12 12 M18 6L6 18',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  clock: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M12 7v5l3 2',
  sliders: 'M4 6h16 M7 12h10 M10 18h4',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  alert: 'M12 3l9.5 17h-19z M12 10v4 M12 17h.01',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 10a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  id: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M9 9a2 2 0 1 1 0 4a2 2 0 1 1 0-4z M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2 M15 10h3 M15 14h3',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 17l-5-5 5-5 M5 12h11',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  settings: 'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z',
  plus: 'M12 5v14 M5 12h14',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3 M16 13h.01',
  ban: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M5.6 5.6l12.8 12.8',
  sos: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z',
  gift: 'M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7c-1.5-3-5-3.5-5-1.2C7 7 9.5 7 12 7z M12 7c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7z',
  ticket: 'M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z M14 6v12',
  copy: 'M9 9h10v11H9z M5 15V4h10',
  share: 'M12 3v12 M7 8l5-5 5 5 M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
};

export type IconName = keyof typeof PATHS;

interface Props {
  name?: IconName;
  d?: string;
  size?: number;
  stroke?: string;
  fill?: string;
  width?: number;
  className?: string;
  label?: string;
}

export function Icon({ name, d, size = 20, stroke = 'currentColor', fill = 'none', width = 2.2, className, label }: Props) {
  const path = d ?? (name ? PATHS[name] : '');
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
    >
      <path d={path} />
    </svg>
  );
}

export function VerifiedMark({ size = 16, label = 'Identidade verificada' }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} style={{ flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="10" fill="#0B6B61" />
      <path d="M8 12l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
