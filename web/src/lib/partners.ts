// Parceiros vindos da API, no formato usado pelas telas.
import { useCallback, useEffect, useState } from 'react';
import { ACTIVITIES, activityByKey, type ActivityKey } from '../data/activities';
import type { Lang } from '../i18n/types';
import { assetUrl, get, type ApiPartnerCard, type ApiPartnerDetail } from './api';

export type WhenKey = 'hoje' | 'amanha' | 'fds';
type T = Record<Lang, string>;

export interface Review { id: string; author: string; activity: ActivityKey; date: string; rating: number; text: string }

export interface Partner {
  id: string;
  name: string;
  age: number;
  initial: string;
  distanceKm: number; // sempre aproximada
  bio: T;
  about: T;
  tags: ActivityKey[];
  online: boolean;
  pricePerHour: number; // em reais
  minHours: number;
  languages: string[];
  rating: number | null;
  reviewsCount: number;
  responseTime: string;
  neighborhood: string;
  avatarUrl?: string;
  map: { x: number; y: number }; // posição ilustrativa (0–100) em volta de você, pela distância aproximada
  photos: string[]; // valores de "background": foto real ou cor da categoria
  hasPhotos: boolean;
  agenda: { offset: number; day: string; date: string; slots: string[] }[]; // horários "HH:MM" (Brasília)
  reviews: Review[];
}

const LANG_KEYS: Lang[] = ['pt', 'es', 'en', 'zh'];
const isAct = (k: string): k is ActivityKey => ACTIVITIES.some((a) => a.key === k);

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const responseLabel = (min: number) => (min < 60 ? `~${Math.max(5, Math.round(min / 5) * 5)} min` : `~${Math.round(min / 60)} h`);

function texts(base: string, tr: ApiPartnerCard['translations'], key: 'bio' | 'about'): T {
  return Object.fromEntries(LANG_KEYS.map((l) => [l, tr?.[l]?.[key] || base])) as T;
}

export function toPartner(a: ApiPartnerCard | ApiPartnerDetail): Partner {
  const tags = a.activities.filter(isAct);
  if (!tags.length) tags.push('bar');
  const detail = 'agenda' in a ? a : null;
  const urls = (detail?.photos ?? []).map((ph) => assetUrl(ph.url)!).filter(Boolean);
  const avatar = assetUrl(a.avatarUrl);
  const pics = urls.length ? urls : avatar ? [avatar] : [];
  const colors = tags.map((t) => activityByKey(t).color);
  const angle = (hash(a.id) % 360) * (Math.PI / 180);
  const r = Math.min(46, 10 + (a.distanceKm ?? 3) * 4);
  return {
    id: a.id,
    name: a.name,
    age: a.age,
    initial: a.name.charAt(0).toUpperCase(),
    distanceKm: a.distanceKm ?? 1,
    bio: texts(a.bio, a.translations, 'bio'),
    about: texts(detail?.about || a.bio, a.translations, detail?.about ? 'about' : 'bio'),
    tags,
    online: a.online,
    pricePerHour: a.priceCents / 100,
    minHours: a.minHours,
    languages: a.languages,
    rating: a.rating,
    reviewsCount: a.reviewsCount,
    responseTime: responseLabel(a.responseMinutes),
    neighborhood: a.neighborhood,
    avatarUrl: avatar,
    map: { x: Math.max(4, Math.min(96, 50 + Math.cos(angle) * r)), y: Math.max(4, Math.min(96, 50 + Math.sin(angle) * r)) },
    photos: pics.length ? pics.map((u) => `center / cover no-repeat url("${u}")`) : colors,
    hasPhotos: pics.length > 0,
    agenda: (detail?.agenda ?? []).map((d) => ({ offset: d.offset, date: d.date, day: String(Number(d.date.slice(8, 10))), slots: d.slots })),
    reviews: (detail?.reviews ?? []).map((rv) => ({
      id: rv.id, author: rv.author, activity: isAct(rv.activity) ? rv.activity : tags[0], rating: rv.rating, text: rv.text,
      date: `${rv.createdAt.slice(5, 7)}/${rv.createdAt.slice(0, 4)}`,
    })),
  };
}

// ---------- Busca ----------
export interface SearchParams {
  activity?: ActivityKey | null; when?: WhenKey | null; q?: string; radiusKm?: number; maxPrice?: number; online?: boolean;
  sort?: 'dist' | 'preco' | 'nota'; lat?: number; lng?: number; city?: string;
}
const WHEN_API: Record<WhenKey, string> = { hoje: 'today', amanha: 'tomorrow', fds: 'weekend' };
const SORT_API = { dist: 'distance', preco: 'price', nota: 'rating' } as const;

export function usePartnerSearch(s: SearchParams, enabled = true) {
  const [items, setItems] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const key = JSON.stringify(s);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({ limit: '50' });
    if (s.activity) q.set('activity', s.activity);
    if (s.when) q.set('when', WHEN_API[s.when]);
    if (s.q?.trim()) q.set('q', s.q.trim());
    if (s.radiusKm) q.set('radiusKm', String(s.radiusKm));
    if (s.maxPrice) q.set('maxPriceCents', String(Math.round(s.maxPrice * 100)));
    if (s.online) q.set('online', 'true');
    if (s.sort) q.set('sort', SORT_API[s.sort]);
    if (s.lat !== undefined && s.lng !== undefined) { q.set('lat', String(s.lat)); q.set('lng', String(s.lng)); }
    else if (s.city) q.set('city', s.city);
    // pequena espera para não chamar a API a cada letra digitada
    const t = window.setTimeout(() => {
      get<{ items: ApiPartnerCard[] }>(`/partners?${q}`)
        .then((r) => { if (alive) { setItems(r.items.map(toPartner)); setError(null); } })
        .catch((e) => { if (alive) setError(e); })
        .finally(() => { if (alive) setLoading(false); });
    }, s.q ? 300 : 0);
    return () => { alive = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return { items, loading, error };
}

// ---------- Perfil ----------
const cache = new Map<string, { p: Partner; canBookPrivate: boolean; isFavorite: boolean }>();

export function usePartner(id?: string) {
  const cached = id ? cache.get(id) : undefined;
  const [state, setState] = useState<{ p?: Partner; canBookPrivate: boolean; loading: boolean; notFound: boolean }>(
    { p: cached?.p, canBookPrivate: cached?.canBookPrivate ?? false, loading: !cached, notFound: false },
  );
  const load = useCallback(async () => {
    if (!id) { setState({ canBookPrivate: false, loading: false, notFound: true }); return; }
    try {
      const r = await get<{ partner: ApiPartnerDetail; viewer: { isFavorite: boolean; canBookPrivate: boolean } | null }>(`/partners/${id}`);
      const p = toPartner(r.partner);
      const entry = { p, canBookPrivate: !!r.viewer?.canBookPrivate, isFavorite: !!r.viewer?.isFavorite };
      cache.set(id, entry);
      setState({ p, canBookPrivate: entry.canBookPrivate, loading: false, notFound: false });
    } catch {
      setState({ canBookPrivate: false, loading: false, notFound: true });
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
}

/** Carrega vários parceiros (ex.: favoritos). */
export function usePartners(ids: string[]) {
  const [list, setList] = useState<Partner[]>([]);
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => (cache.has(id) ? Promise.resolve(cache.get(id)!.p) : get<{ partner: ApiPartnerDetail }>(`/partners/${id}`).then((r) => toPartner(r.partner)).catch(() => null))))
      .then((ps) => { if (alive) setList(ps.filter((p): p is Partner => !!p)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return list;
}
