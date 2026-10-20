// Centro aproximado das principais cidades do Brasil. Usado quando o parceiro informa a cidade
// mas não compartilha a localização do aparelho (a posição é sempre arredondada para ~1 km).
const CITY_ROWS: [string, number, number][] = [
  ['São Paulo', -23.5505, -46.6333],
  ['Rio de Janeiro', -22.9068, -43.1729],
  ['Belo Horizonte', -19.9167, -43.9345],
  ['Brasília', -15.7939, -47.8828],
  ['Salvador', -12.9777, -38.5016],
  ['Fortaleza', -3.7319, -38.5267],
  ['Recife', -8.0476, -34.877],
  ['Curitiba', -25.4284, -49.2733],
  ['Porto Alegre', -30.0346, -51.2177],
  ['Florianópolis', -27.5954, -48.548],
  ['Manaus', -3.119, -60.0217],
  ['Belém', -1.4558, -48.4902],
  ['Goiânia', -16.6869, -49.2648],
  ['Campinas', -22.9099, -47.0626],
  ['Santos', -23.9608, -46.3336],
  ['Guarulhos', -23.4538, -46.5333],
  ['São Bernardo do Campo', -23.6914, -46.5646],
  ['Santo André', -23.6639, -46.5383],
  ['Osasco', -23.5329, -46.7917],
  ['Niterói', -22.8832, -43.1034],
  ['Vitória', -20.3155, -40.3128],
  ['Natal', -5.7945, -35.211],
  ['João Pessoa', -7.1195, -34.845],
  ['Maceió', -9.6658, -35.735],
  ['Aracaju', -10.9472, -37.0731],
  ['Teresina', -5.0892, -42.8019],
  ['São Luís', -2.5307, -44.3068],
  ['Cuiabá', -15.601, -56.0974],
  ['Campo Grande', -20.4697, -54.6201],
  ['Ribeirão Preto', -21.1704, -47.8103],
  ['Sorocaba', -23.5015, -47.4526],
  ['São José dos Campos', -23.1896, -45.8841],
  ['Uberlândia', -18.9186, -48.2772],
  ['Londrina', -23.3045, -51.1696],
  ['Joinville', -26.3045, -48.8487],
  ['Balneário Camboriú', -26.9926, -48.6352],
  ['Ubatuba', -23.4336, -45.0838],
  ['Guarujá', -23.9931, -46.2564],
  ['São Sebastião', -23.8064, -45.4097],
];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*[-/,].*$/, '').replace(/\s+/g, ' ').trim();
const CITIES: Record<string, [number, number]> = Object.fromEntries(CITY_ROWS.map(([n, a, b]) => [norm(n), [a, b]]));
/** Cidades que o app conhece (lista de escolha no cadastro do parceiro). */
export const CITY_NAMES = CITY_ROWS.map(([n]) => n).sort((a, b) => a.localeCompare(b, 'pt-BR'));

export const normalizeCity = norm;

export function cityCenter(name?: string | null): { lat: number; lng: number } | null {
  if (!name) return null;
  const c = CITIES[normalizeCity(name)];
  return c ? { lat: c[0], lng: c[1] } : null;
}
