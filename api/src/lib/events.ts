// Eventos em tempo real (Server-Sent Events): o servidor avisa o app na hora quando chega mensagem,
// notificação ou "digitando…". Funciona atrás do Caddy/HTTPS sem configuração extra.
// Obs.: guarda as conexões na memória — com mais de uma instância da API, troque por Redis Pub/Sub.
type Listener = (event: string, data: unknown) => void;
const subs = new Map<string, Set<Listener>>();

export function subscribe(userId: string, fn: Listener) {
  let set = subs.get(userId);
  if (!set) { set = new Set(); subs.set(userId, set); }
  set.add(fn);
  return () => { set!.delete(fn); if (!set!.size) subs.delete(userId); };
}

export function publish(userId: string, event: string, data: unknown) {
  subs.get(userId)?.forEach((fn) => { try { fn(event, data); } catch { /* conexão fechada */ } });
}

export const isOnline = (userId: string) => (subs.get(userId)?.size ?? 0) > 0;
export const connectionCount = () => [...subs.values()].reduce((n, s) => n + s.size, 0);
