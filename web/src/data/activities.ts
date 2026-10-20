// Categorias de programas. Os textos (nome, descrição) ficam nos dicionários de idioma: src/i18n/*.ts → act.
export type ActivityKey =
  | 'balada' | 'bar' | 'praia' | 'casa' | 'sitio'
  | 'show' | 'jantar' | 'museu' | 'turismo' | 'evento' | 'cuidado';

export interface Activity {
  key: ActivityKey;
  emoji: string;
  color: string;
  soft: string; // fundo suave (acompanha o modo claro/escuro)
  ink: string; // cor do texto sobre o fundo suave
  icon: string; // caminho SVG (stroke), no mesmo estilo dos demais ícones
  featured?: boolean; // aparece em destaque na página inicial
  privateVenue?: boolean; // local privado: exige 1º encontro concluído em local público
}

const RAW: Omit<Activity, 'ink'>[] = [
  // Destaques
  {
    key: 'balada', emoji: '🌃', color: '#7E22CE', soft: '#F3E8FF', featured: true,
    icon: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z',
  },
  {
    key: 'bar', emoji: '🍸', color: '#9F1239', soft: '#FFE4E6', featured: true,
    icon: 'M5 4h14l-7 8z M12 12v8 M8 20h8 M15.5 4l2.5-2',
  },
  {
    key: 'praia', emoji: '🏖️', color: '#0369A1', soft: '#E0F2FE', featured: true,
    icon: 'M4 12a8 8 0 0 1 16 0z M12 12v6 M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1',
  },
  {
    key: 'casa', emoji: '🏠', color: '#C2410C', soft: '#FFEDD5', featured: true, privateVenue: true,
    icon: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
  },
  {
    key: 'sitio', emoji: '🌳', color: '#15803D', soft: '#DCFCE7', featured: true, privateVenue: true,
    icon: 'M12 22v-6 M12 16a6 6 0 0 1-6-6a6 6 0 0 1 6-7a6 6 0 0 1 6 7a6 6 0 0 1-6 6z M8 22h8',
  },
  // Demais programas
  {
    key: 'show', emoji: '🎤', color: '#D9381E', soft: '#FDE9E4',
    icon: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M21 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  },
  {
    key: 'jantar', emoji: '🍽️', color: '#B45309', soft: '#FEF1DE',
    icon: 'M4 3v8a3 3 0 0 0 3 3v7 M7 3v6 M10 3v8a3 3 0 0 1-3 3 M17 21V3c2 0 3 3 3 7h-3',
  },
  {
    key: 'museu', emoji: '🏛️', color: '#5B3FD6', soft: '#ECE8FC',
    icon: 'M3 10l9-6 9 6 M5 10v9 M9.5 10v9 M14.5 10v9 M19 10v9 M3 21h18',
  },
  {
    key: 'turismo', emoji: '🗺️', color: '#0B6B61', soft: '#E3F2EF',
    icon: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0 M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  },
  {
    key: 'evento', emoji: '🎉', color: '#1D4ED8', soft: '#E4EBFC',
    icon: 'M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2 M3 13h18',
  },
  {
    key: 'cuidado', emoji: '🤝', color: '#B0175A', soft: '#FBE6EF',
    icon: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  },
];

// Os tons suaves são misturados com a cor de fundo do tema: claros no modo claro, escuros no modo escuro.
export const ACTIVITIES: Activity[] = RAW.map((a) => ({
  ...a,
  soft: `color-mix(in srgb, ${a.color} var(--act-soft, 12%), var(--white))`,
  ink: `color-mix(in srgb, ${a.color} var(--act-ink, 100%), #fff)`,
}));

export const FEATURED = ACTIVITIES.filter((a) => a.featured);
export const OTHERS = ACTIVITIES.filter((a) => !a.featured);
export const activityByKey = (k: ActivityKey) => ACTIVITIES.find((a) => a.key === k)!;
