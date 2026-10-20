// Tempo real: um único canal SSE (GET /api/events) por aparelho.
// Recebe notification · message · typing · read. Se cair, o navegador reconecta sozinho;
// enquanto isso, as telas continuam com a atualização periódica (mais lenta).
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { getToken, isNativeApp } from './api';

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
const handlers = new Map<string, Set<Handler>>();
const statusListeners = new Set<(on: boolean) => void>();
let es: EventSource | null = null;
let connected = false;
const EVENTS = ['notification', 'message', 'typing', 'read'];

function setConnected(on: boolean) {
  if (connected === on) return;
  connected = on;
  statusListeners.forEach((fn) => fn(on));
}

export function startRealtime() {
  if (es || typeof EventSource === 'undefined') return;
  let url = `${CONFIG.apiBaseUrl}/api/events`;
  if (isNativeApp()) {
    const t = getToken();
    if (!t) return;
    url += `?token=${encodeURIComponent(t)}`;
  }
  es = new EventSource(url, { withCredentials: true });
  es.addEventListener('ready', () => setConnected(true));
  es.onerror = () => {
    setConnected(false);
    // 401 (sessão expirada) fecha o canal de vez; não insiste
    if (es && es.readyState === EventSource.CLOSED) { es = null; }
  };
  for (const ev of EVENTS) {
    es.addEventListener(ev, (e) => {
      let data: unknown = null;
      try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
      handlers.get(ev)?.forEach((fn) => fn(data));
    });
  }
}

export function stopRealtime() {
  es?.close();
  es = null;
  setConnected(false);
}

export function onRealtime(event: string, fn: Handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(fn);
  return () => { handlers.get(event)?.delete(fn); };
}

/** Assina um evento enquanto o componente estiver na tela. */
export function useRealtime(event: string, fn: Handler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onRealtime(event, (d) => ref.current(d)), [event]);
}

/** true quando o canal em tempo real está aberto (as telas podem atualizar com menos frequência). */
export function useRealtimeStatus() {
  const [on, setOn] = useState(connected);
  useEffect(() => { statusListeners.add(setOn); setOn(connected); return () => { statusListeners.delete(setOn); }; }, []);
  return on;
}
