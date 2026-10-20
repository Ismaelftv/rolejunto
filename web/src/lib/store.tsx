// Estado global do app, ligado à API do RolêJunto.
// Guarda o usuário logado, reservas, favoritos, bloqueios e notificações, e atualiza tudo periodicamente.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActivityKey } from '../data/activities';
import { useI18n } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  ApiError, assetUrl, del, get, patch, post, put, setToken, setUnauthorizedHandler,
  type ApiBooking, type ApiNotification, type ApiUser,
} from './api';

export type Role = 'cliente' | 'parceiro' | 'admin';
export type Verification = 'pendente' | 'em_analise' | 'verificado' | 'recusado';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  verification: Verification;
  emailVerified: boolean;
  birthDate?: string;
  trustedContact?: { name: string; phone: string };
  phone?: string;
  city?: string;
  avatar?: string;
  interests?: ActivityKey[];
  lang?: string;
  notifications: { email: boolean; push: boolean; promos: boolean };
}

export type BookingStatus = 'aguardando' | 'confirmada' | 'em_andamento' | 'concluida' | 'cancelada' | 'recusada';

export interface Booking {
  id: string;
  mine: 'client' | 'partner'; // meu papel nesta reserva
  partnerId: string;
  clientId: string;
  other: { id: string; name: string; avatar?: string; role?: string }; // a outra pessoa
  activity: ActivityKey;
  date: string; // AAAA-MM-DD (Brasília)
  time: string; // HH:MM (Brasília)
  startsAt: number;
  hours: number;
  place: string;
  privateVenue?: boolean;
  note: string;
  payment: 'pix' | 'cartao';
  subtotal: number;
  fee: number;
  total: number;
  status: BookingStatus;
  paymentStatus: string;
  createdAt: number;
  rating?: number;
  checkInAt?: number;
  paid?: boolean;
}

interface Toast { id: number; text: string; kind: 'ok' | 'warn' }

const ROLE: Record<ApiUser['role'], Role> = { client: 'cliente', partner: 'parceiro', admin: 'admin' };
const VER: Record<ApiUser['verification'], Verification> = { pending: 'pendente', in_review: 'em_analise', verified: 'verificado', rejected: 'recusado' };
const STATUS: Record<ApiBooking['status'], BookingStatus> = {
  requested: 'aguardando', accepted: 'confirmada', in_progress: 'em_andamento', completed: 'concluida', cancelled: 'cancelada', declined: 'recusada',
};

export function toUser(u: ApiUser): User {
  return {
    id: u.id, name: u.name, email: u.email, role: ROLE[u.role], verification: VER[u.verification], emailVerified: u.emailVerified, birthDate: u.birthDate,
    trustedContact: u.trustedContact ?? undefined, phone: u.phone ?? undefined, city: u.city ?? undefined,
    avatar: assetUrl(u.avatarUrl), interests: u.interests as ActivityKey[], lang: u.lang, notifications: u.notifications,
  };
}

/** Data e hora no horário de Brasília (a agenda dos parceiros usa esse fuso). */
export const brDate = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString();

export function toBooking(b: ApiBooking, meId: string): Booking {
  const local = brDate(b.startsAt);
  const mine = b.clientId === meId ? 'client' : 'partner';
  const o = b.other ?? { id: mine === 'client' ? b.partnerId : b.clientId, name: '—', avatarUrl: null };
  return {
    id: b.id, mine, partnerId: b.partnerId, clientId: b.clientId,
    other: { id: o.id, name: o.name.split(' ')[0], avatar: assetUrl(o.avatarUrl), role: o.role },
    activity: b.activity as ActivityKey, date: local.slice(0, 10), time: local.slice(11, 16), startsAt: new Date(b.startsAt).getTime(),
    hours: b.hours, place: b.place, privateVenue: b.privateVenue, note: b.note, payment: b.paymentMethod === 'card' ? 'cartao' : 'pix',
    subtotal: b.subtotalCents / 100, fee: b.feeCents / 100, total: b.totalCents / 100, status: STATUS[b.status], paymentStatus: b.paymentStatus,
    createdAt: new Date(b.createdAt).getTime(), rating: b.myRating ?? undefined, checkInAt: b.checkInAt ? new Date(b.checkInAt).getTime() : undefined,
    paid: ['paid', 'released'].includes(b.paymentStatus),
  };
}

/** Traduz o erro da API (pelo código) para o idioma atual. */
export function errorText(d: Dict, e: unknown) {
  if (e instanceof ApiError) return (d.live.errors as Record<string, string>)[e.code] ?? (e.status >= 500 ? d.live.errors.internal : e.message || d.live.errors.generic);
  return d.live.errors.generic;
}

export interface SignupData { name: string; email: string; password: string; role: Role; birthDate: string; lang: string }
export type BookingAction = 'cancel' | 'check-in' | 'complete' | 'accept' | 'decline';

interface StoreShape {
  ready: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  signup: (data: SignupData) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (patch: Record<string, unknown>) => Promise<void>;
  setUser: (u: ApiUser) => void;
  favorites: string[];
  toggleFav: (id: string) => void;
  blocked: { id: string; name: string }[];
  refreshBlocked: () => Promise<void>;
  unblock: (id: string) => Promise<void>;
  bookings: Booking[];
  bookingsLoaded: boolean;
  refreshBookings: () => Promise<void>;
  createBooking: (body: Record<string, unknown>) => Promise<Booking>;
  bookingAction: (id: string, action: BookingAction) => Promise<Booking>;
  rateBooking: (id: string, rating: number, text: string) => Promise<void>;
  sos: (id: string) => Promise<void>;
  upsertBooking: (b: ApiBooking) => Booking;
  notifications: ApiNotification[];
  unread: number;
  refreshNotifs: () => Promise<void>;
  markNotifsSeen: () => Promise<void>;
  toasts: Toast[];
  toast: (text: string, kind?: 'ok' | 'warn') => void;
  fail: (e: unknown) => void; // mostra o erro traduzido
}

const Ctx = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { d, lang, setLang } = useI18n();
  const dRef = useRef(d);
  dRef.current = d;
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const toast = useCallback((text: string, kind: 'ok' | 'warn' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const fail = useCallback((e: unknown) => toast(errorText(dRef.current, e), 'warn'), [toast]);

  const clear = useCallback(() => {
    setUserState(null); setFavorites([]); setBlocked([]); setBookings([]); setBookingsLoaded(false); setNotifications([]);
  }, []);

  const setUser = useCallback((u: ApiUser) => setUserState(toUser(u)), []);

  const refreshBookings = useCallback(async () => {
    const me = userRef.current;
    if (!me) return;
    const r = await get<{ items: ApiBooking[] }>('/bookings');
    setBookings(r.items.map((b) => toBooking(b, me.id)));
    setBookingsLoaded(true);
  }, []);
  const refreshNotifs = useCallback(async () => {
    if (!userRef.current) return;
    const r = await get<{ items: ApiNotification[] }>('/notifications');
    setNotifications(r.items);
  }, []);
  const refreshBlocked = useCallback(async () => {
    const r = await get<{ items: { userId: string; name: string }[] }>('/blocks');
    setBlocked(r.items.map((x) => ({ id: x.userId, name: x.name.split(' ')[0] })));
  }, []);

  // applyLang: no login, o idioma salvo na conta passa a valer; ao reabrir o app, vale o escolhido no aparelho.
  const afterLogin = useCallback(async (u: ApiUser, applyLang = true) => {
    const mapped = toUser(u);
    userRef.current = mapped;
    setUserState(mapped);
    if (applyLang && ['pt', 'es', 'en', 'zh'].includes(u.lang)) setLang(u.lang as 'pt');
    await Promise.allSettled([
      refreshBookings(), refreshNotifs(), refreshBlocked(),
      get<{ partnerIds: string[] }>('/me/favorites').then((r) => setFavorites(r.partnerIds)),
    ]);
    return mapped;
  }, [refreshBookings, refreshNotifs, refreshBlocked, setLang]);

  // Sessão existente ao abrir o app
  useEffect(() => {
    setUnauthorizedHandler(() => { setToken(null); clear(); });
    get<{ user: ApiUser | null }>('/auth/me')
      .then(async (r) => { if (r.user) await afterLogin(r.user, false); })
      .catch(() => { /* API fora do ar: segue como visitante */ })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idioma escolhido no seletor fica salvo na conta (e-mails e avisos no idioma certo)
  useEffect(() => {
    if (!user || user.lang === lang) return;
    setUserState((u) => (u ? { ...u, lang } : u));
    void patch('/me', { lang }).catch(() => {});
  }, [lang, user?.id, user?.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualização periódica (reservas e notificações) enquanto o app está aberto
  useEffect(() => {
    if (!user) return;
    const tick = () => { if (document.visibilityState === 'visible') { void refreshNotifs().catch(() => {}); void refreshBookings().catch(() => {}); } };
    const t = window.setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [user?.id, refreshNotifs, refreshBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsertBooking = useCallback((b: ApiBooking) => {
    const nb = toBooking(b, userRef.current?.id ?? '');
    setBookings((list) => {
      const old = list.find((x) => x.id === nb.id);
      const merged = old && nb.rating === undefined ? { ...nb, rating: old.rating } : nb;
      return old ? list.map((x) => (x.id === nb.id ? merged : x)) : [merged, ...list];
    });
    return nb;
  }, []);

  const value = useMemo<StoreShape>(() => ({
    ready,
    user,
    login: async (email, password) => {
      const r = await post<{ user: ApiUser }>('/auth/login', { email, password });
      return afterLogin(r.user);
    },
    signup: async (s) => {
      const r = await post<{ user: ApiUser }>('/auth/signup', {
        name: s.name, email: s.email, password: s.password, birthDate: s.birthDate, role: s.role === 'parceiro' ? 'partner' : 'client',
        lang: s.lang, acceptTerms: true, privacyConsent: true,
      });
      return afterLogin(r.user);
    },
    logout: async () => {
      try { await post('/auth/logout'); } catch { /* ignore */ }
      setToken(null);
      clear();
    },
    refreshUser: async () => {
      const r = await get<{ user: ApiUser | null }>('/auth/me');
      if (r.user) setUserState(toUser(r.user));
    },
    updateUser: async (body) => {
      const r = await patch<{ user: ApiUser }>('/me', body);
      setUserState(toUser(r.user));
    },
    setUser,
    favorites,
    toggleFav: (id) => {
      if (!userRef.current) { toast(dRef.current.live.loginToSave, 'warn'); return; }
      const on = favorites.includes(id);
      setFavorites((f) => (on ? f.filter((x) => x !== id) : [...f, id]));
      (on ? del(`/me/favorites/${id}`) : put(`/me/favorites/${id}`)).catch((e) => {
        setFavorites((f) => (on ? [...f, id] : f.filter((x) => x !== id)));
        fail(e);
      });
    },
    blocked,
    refreshBlocked,
    unblock: async (id) => {
      await del(`/blocks/${id}`);
      setBlocked((b) => b.filter((x) => x.id !== id));
    },
    bookings,
    bookingsLoaded,
    refreshBookings,
    upsertBooking,
    createBooking: async (body) => {
      const r = await post<{ booking: ApiBooking }>('/bookings', body);
      return upsertBooking(r.booking);
    },
    bookingAction: async (id, action) => {
      const r = await post<{ booking: ApiBooking }>(`/bookings/${id}/${action}`);
      void refreshNotifs().catch(() => {});
      return upsertBooking(r.booking);
    },
    rateBooking: async (id, rating, text) => {
      await post(`/bookings/${id}/review`, { rating, text });
      setBookings((list) => list.map((x) => (x.id === id ? { ...x, rating } : x)));
    },
    sos: async (id) => { await post(`/bookings/${id}/sos`); },
    notifications,
    unread: notifications.filter((n) => n.unread).length,
    refreshNotifs,
    markNotifsSeen: async () => {
      setNotifications((list) => list.map((n) => ({ ...n, unread: false })));
      await post('/notifications/seen').catch(() => {});
    },
    toasts,
    toast,
    fail,
  }), [ready, user, favorites, blocked, bookings, bookingsLoaded, notifications, toasts, toast, fail, afterLogin, clear, setUser,
    refreshBlocked, refreshBookings, refreshNotifs, upsertBooking]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fora do StoreProvider');
  return v;
}

