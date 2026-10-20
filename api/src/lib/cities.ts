// Centro aproximado das principais cidades do Brasil. Usado quando o parceiro informa a cidade
// mas não compartilha a localização do aparelho (a posição é sempre arredondada para ~1 km).
const CITIES: Record<string, [number, number]> = {
  'sao paulo': [-23.5505, -46.6333], 'rio de janeiro': [-22.9068, -43.1729], 'belo horizonte': [-19.9167, -43.9345],
  'brasilia': [-15.7939, -47.8828], 'salvador': [-12.9777, -38.5016], 'fortaleza': [-3.7319, -38.5267], 'recife': [-8.0476, -34.877],
  'curitiba': [-25.4284, -49.2733], 'porto alegre': [-30.0346, -51.2177], 'florianopolis': [-27.5954, -48.548], 'manaus': [-3.119, -60.0217],
  'belem': [-1.4558, -48.4902], 'goiania': [-16.6869, -49.2648], 'campinas': [-22.9099, -47.0626], 'santos': [-23.9608, -46.3336],
  'guarulhos': [-23.4538, -46.5333], 'sao bernardo do campo': [-23.6914, -46.5646], 'santo andre': [-23.6639, -46.5383], 'osasco': [-23.5329, -46.7917],
  'niteroi': [-22.8832, -43.1034], 'vitoria': [-20.3155, -40.3128], 'natal': [-5.7945, -35.211], 'joao pessoa': [-7.1195, -34.845],
  'maceio': [-9.6658, -35.735], 'aracaju': [-10.9472, -37.0731], 'teresina': [-5.0892, -42.8019], 'sao luis': [-2.5307, -44.3068],
  'cuiaba': [-15.601, -56.0974], 'campo grande': [-20.4697, -54.6201], 'ribeirao preto': [-21.1704, -47.8103], 'sorocaba': [-23.5015, -47.4526],
  'sao jose dos campos': [-23.1896, -45.8841], 'uberlandia': [-18.9186, -48.2772], 'londrina': [-23.3045, -51.1696], 'joinville': [-26.3045, -48.8487],
  'balneario camboriu': [-26.9926, -48.6352], 'ubatuba': [-23.4336, -45.0838], 'guaruja': [-23.9931, -46.2564], 'sao sebastiao': [-23.8064, -45.4097],
};

export const normalizeCity = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*[-/,].*$/, '').replace(/\s+/g, ' ').trim();

export function cityCenter(name?: string | null): { lat: number; lng: number } | null {
  if (!name) return null;
  const c = CITIES[normalizeCity(name)];
  return c ? { lat: c[0], lng: c[1] } : null;
}
