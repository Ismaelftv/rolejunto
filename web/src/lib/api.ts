// Cliente HTTP da API do RolêJunto.
// - Site: sessão em cookie httpOnly (o navegador envia sozinho).
// - App nativo (Capacitor): a API devolve um token, guardado no aparelho e enviado em "Authorization: Bearer".
import { CONFIG } from './config';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const TOKEN_KEY = 'rolejunto:token';
const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null | undefined) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/** Completa caminhos relativos devolvidos pela API (ex.: /uploads/foto.jpg). */
export const assetUrl = (u?: string | null) => (!u ? undefined : /^https?:|^data:/.test(u) ? u : `${CONFIG.apiBaseUrl}${u}`);

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (isNative()) {
    headers['x-client'] = 'app';
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${CONFIG.apiBaseUrl}/api${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor.');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, e?.code ?? `http_${res.status}`, e?.message ?? res.statusText, e?.details);
  }
  const token = (data as { token?: string } | null)?.token;
  if (token) setToken(token);
  return data as T;
}

export const get = <T>(p: string) => request<T>('GET', p);
export const post = <T>(p: string, b: unknown = {}) => request<T>('POST', p, b);
export const put = <T>(p: string, b: unknown = {}) => request<T>('PUT', p, b);
export const patch = <T>(p: string, b: unknown = {}) => request<T>('PATCH', p, b);
export const del = <T>(p: string, b?: unknown) => request<T>('DELETE', p, b);

// ---------- Formatos devolvidos pela API ----------
export type ApiRole = 'client' | 'partner' | 'admin';
export type ApiVerification = 'pending' | 'in_review' | 'verified' | 'rejected';
export type ApiBookingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'in_progress' | 'completed';
export type ApiPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'released';

export interface ApiUser {
  id: string; email: string; name: string; role: ApiRole; birthDate: string; phone: string | null; city: string | null;
  avatarUrl: string | null; lang: string; interests: string[]; verification: ApiVerification; emailVerified: boolean;
  trustedContact: { name: string; phone: string } | null;
  notifications: { email: boolean; push: boolean; promos: boolean };
  notifSeenAt: string; createdAt: string;
}

export interface ApiPartnerCard {
  id: string; name: string; age: number; avatarUrl: string | null; bio: string;
  translations: Record<string, { bio?: string; about?: string }>;
  activities: string[]; priceCents: number; minHours: number; languages: string[]; neighborhood: string; city: string;
  rating: number | null; reviewsCount: number; responseMinutes: number; distanceKm: number | null; online: boolean;
}
export interface ApiPartnerDetail extends ApiPartnerCard {
  about: string;
  photos: { id: string; url: string }[];
  reviews: { id: string; author: string; activity: string; rating: number; text: string; createdAt: string }[];
  agenda: { date: string; offset: number; slots: string[] }[];
}

export interface ApiPerson { id: string; name: string; avatarUrl: string | null; role?: ApiRole }
export interface ApiBooking {
  id: string; clientId: string; partnerId: string; activity: string; startsAt: string; hours: number; place: string;
  privateVenue: boolean; note: string; priceCents: number; subtotalCents: number; feeCents: number; totalCents: number;
  status: ApiBookingStatus; paymentStatus: ApiPaymentStatus; paymentMethod: 'pix' | 'card';
  checkInAt: string | null; completedAt: string | null; cancelledAt: string | null; createdAt: string;
  other: ApiPerson | null; myRating?: number | null;
}

export interface ApiPayment {
  test?: boolean; // provedor de testes (sem cobrança real)
  id: string; bookingId: string; method: 'pix' | 'card'; amountCents: number; status: string;
  pixCode: string | null; pixQrBase64: string | null; checkoutUrl: string | null; expiresAt: string | null; paidAt: string | null; ref: string | null;
}

export interface ApiMessage { id: string; kind: 'text' | 'system'; from: 'me' | 'them' | 'system'; body: string; data: Record<string, unknown> | null; createdAt: string }
export interface ApiConversation { id: string; other: ApiPerson | null; lastMessage: ApiMessage | null; unread: number }
export interface ApiNotification { id: string; type: string; data: Record<string, unknown>; link: string | null; createdAt: string; unread: boolean }
