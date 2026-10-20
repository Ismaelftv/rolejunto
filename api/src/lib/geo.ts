// Localização aproximada: nunca expomos (nem guardamos) a posição exata dos parceiros.

/** Arredonda para uma grade de ~1 km (0,01°). */
export const approx = (v: number) => Math.round(v * 100) / 100;

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Distância exibida: sempre inteira e no mínimo 1 km, para não revelar proximidade exata. */
export const displayKm = (km: number) => Math.max(1, Math.round(km));

/** Caixa de busca para filtrar no banco antes de calcular a distância. */
export function bbox(lat: number, lng: number, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
