// Provedores de pagamento. Troque PAYMENT_PROVIDER=mercadopago em produção.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export interface PixCharge { providerRef: string; pixCode: string; pixQrBase64?: string; expiresAt: Date }
export interface CardCheckout { providerRef: string; checkoutUrl: string }
export type ProviderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PaymentProvider {
  name: string;
  /** Provedor sem cartão (só Pix) */
  noCard?: boolean;
  /** Provedor sem API de estorno: o reembolso é feito à mão no painel do provedor */
  manualRefund?: boolean;
  createPix(p: { paymentId: string; amountCents: number; description: string; payerEmail: string; payerName?: string }): Promise<PixCharge>;
  createCard(p: { paymentId: string; amountCents: number; description: string; payerEmail: string; returnUrl: string }): Promise<CardCheckout>;
  /** Consulta a situação no provedor (usado quando o cliente toca em "Já paguei"). */
  getStatus(p: { providerRef: string; paymentId: string; method: 'pix' | 'card' }): Promise<ProviderStatus>;
  refund(p: { providerRef: string; amountCents: number }): Promise<void>;
  /** Valida e interpreta o aviso (webhook) do provedor. Retorna null se não for um evento de pagamento. */
  parseWebhook(p: { headers: Record<string, string | string[] | undefined>; body: unknown; query: Record<string, string>; rawBody?: string }): Promise<{ paymentId: string; providerRef: string; status: ProviderStatus } | null>;
}

// ---------- Mock (desenvolvimento) ----------
const mockPaid = new Set<string>();
export const mockProvider: PaymentProvider & { simulatePaid(ref: string): void } = {
  name: 'mock',
  async createPix({ paymentId, amountCents }) {
    const ref = `mock_${paymentId.slice(0, 8)}`;
    const amount = (amountCents / 100).toFixed(2);
    return {
      providerRef: ref,
      pixCode: `00020126580014BR.GOV.BCB.PIX0136${paymentId}5204000053039865406${amount}5802BR5909ROLEJUNTO6009SAO PAULO62070503***6304ABCD`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  },
  async createCard({ paymentId, returnUrl }) {
    return { providerRef: `mock_card_${paymentId.slice(0, 8)}`, checkoutUrl: `${returnUrl}?mock_checkout=${paymentId}` };
  },
  async getStatus({ providerRef }) { return mockPaid.has(providerRef) ? 'paid' : 'pending'; },
  async refund() { /* nada a fazer no mock */ },
  async parseWebhook() { return null; },
  simulatePaid(ref) { mockPaid.add(ref); },
};

// ---------- Mercado Pago ----------
// Pix: API de pagamentos. Cartão: Checkout Pro (o cliente digita o cartão no ambiente do Mercado Pago).
// Teste antes com credenciais de teste (sandbox). Documentação: https://www.mercadopago.com.br/developers
const MP = 'https://api.mercadopago.com';

async function mp<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.MERCADOPAGO_ACCESS_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
  const res = await fetch(`${MP}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const mapMp = (s: string): ProviderStatus => (s === 'approved' ? 'paid' : s === 'refunded' || s === 'charged_back' ? 'refunded' : s === 'rejected' || s === 'cancelled' ? 'failed' : 'pending');

export const mercadoPagoProvider: PaymentProvider = {
  name: 'mercadopago',
  async createPix({ paymentId, amountCents, description, payerEmail }) {
    const r = await mp<{ id: number; date_of_expiration?: string; point_of_interaction: { transaction_data: { qr_code: string; qr_code_base64: string } } }>('/v1/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': paymentId },
      body: JSON.stringify({
        transaction_amount: amountCents / 100, description, payment_method_id: 'pix', payer: { email: payerEmail },
        external_reference: paymentId, notification_url: `${config.PUBLIC_URL}/api/webhooks/payments`,
        date_of_expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
    });
    return {
      providerRef: String(r.id),
      pixCode: r.point_of_interaction.transaction_data.qr_code,
      pixQrBase64: r.point_of_interaction.transaction_data.qr_code_base64,
      expiresAt: r.date_of_expiration ? new Date(r.date_of_expiration) : new Date(Date.now() + 15 * 60 * 1000),
    };
  },
  async createCard({ paymentId, amountCents, description, payerEmail, returnUrl }) {
    const r = await mp<{ id: string; init_point: string }>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ title: description, quantity: 1, unit_price: amountCents / 100, currency_id: 'BRL' }],
        payer: { email: payerEmail }, external_reference: paymentId,
        back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl }, auto_return: 'approved',
        notification_url: `${config.PUBLIC_URL}/api/webhooks/payments`,
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 3 },
      }),
    });
    return { providerRef: r.id, checkoutUrl: r.init_point };
  },
  async getStatus({ providerRef, paymentId, method }) {
    if (method === 'pix') return mapMp((await mp<{ status: string }>(`/v1/payments/${providerRef}`)).status);
    const s = await mp<{ results: { status: string }[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(paymentId)}`);
    return s.results.some((p) => p.status === 'approved') ? 'paid' : 'pending';
  },
  async refund({ providerRef, amountCents }) {
    await mp(`/v1/payments/${providerRef}/refunds`, { method: 'POST', headers: { 'X-Idempotency-Key': randomUUID() }, body: JSON.stringify({ amount: amountCents / 100 }) });
  },
  async parseWebhook({ headers, body, query }) {
    const b = body as { type?: string; data?: { id?: string } };
    const dataId = String(b?.data?.id ?? query['data.id'] ?? '');
    if ((b?.type ?? query.type) !== 'payment' || !dataId) return null;
    // Validação da assinatura (x-signature) — obrigatória em produção
    if (config.MERCADOPAGO_WEBHOOK_SECRET) {
      const sig = String(headers['x-signature'] ?? '');
      const reqId = String(headers['x-request-id'] ?? '');
      const parts = Object.fromEntries(sig.split(',').map((kv) => kv.trim().split('=') as [string, string]));
      const manifest = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${parts.ts};`;
      const expected = createHmac('sha256', config.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
      if (expected !== parts.v1) throw new Error('assinatura do webhook inválida');
    }
    const p = await mp<{ id: number; status: string; external_reference: string }>(`/v1/payments/${dataId}`);
    return { paymentId: p.external_reference, providerRef: String(p.id), status: mapMp(p.status) };
  },
};

// ---------- SharkPay ----------
// Pix por cobrança avulsa (POST /api/pix/create). Autenticação: Basic chave-pública:chave-secreta em /api/auth devolve um token (30 dias).
// Aviso de pagamento: webhook "invoice.paid" assinado em "SharkPay-Signature: t=<unix>,v1=<hmac_sha256(segredo, t.corpo)>".
// Não há API de estorno nem de cartão sem dados do cartão: cartão fica desligado e o reembolso é feito no painel da SharkPay.
let spToken: { value: string; exp: number } | null = null;

async function spAuth(force = false): Promise<string> {
  if (!force && spToken && spToken.exp > Date.now() + 60_000) return spToken.value;
  if (!config.SHARKPAY_PUBLIC_KEY || !config.SHARKPAY_SECRET_KEY) throw new Error('SHARKPAY_PUBLIC_KEY / SHARKPAY_SECRET_KEY não configurados');
  const res = await fetch(`${config.SHARKPAY_URL}/api/auth`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.SHARKPAY_PUBLIC_KEY}:${config.SHARKPAY_SECRET_KEY}`).toString('base64')}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SharkPay auth ${res.status}`);
  const j = (await res.json()) as { success?: { token: string; expires_in?: number } };
  if (!j.success?.token) throw new Error('SharkPay auth sem token');
  spToken = { value: j.success.token, exp: Date.now() + Math.min((j.success.expires_in ?? 86400) * 1000, 24 * 3600_000) };
  return spToken.value;
}

async function sp<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${config.SHARKPAY_URL}/api${path}`, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${await spAuth()}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401 && retry) { spToken = null; await spAuth(true); return sp<T>(path, init, false); }
  if (!res.ok) throw new Error(`SharkPay ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

const mapSp = (s: string | number): ProviderStatus => {
  const v = String(s).toUpperCase();
  return v === 'PAID' || v === '1' ? 'paid' : v === 'REFUNDED' || v === '3' ? 'refunded' : v === 'CANCELED' || v === '2' ? 'failed' : 'pending';
};

export function verifySharkPaySignature(secret: string, header: string, body: string, toleranceSec = 300, now = Date.now()): boolean {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  if (!parts.t || !parts.v1 || !/^\d+$/.test(parts.t)) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const sharkPayProvider: PaymentProvider = {
  name: 'sharkpay', noCard: true, manualRefund: true,
  async createPix({ paymentId, amountCents, description, payerEmail, payerName }) {
    const doc = (config.SHARKPAY_PAYER_DOCUMENT ?? '').replace(/\D/g, '');
    if (!doc) throw new Error('SHARKPAY_PAYER_DOCUMENT não configurado');
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    const r = await sp<{ invoice: { reference: string; copy: string; qrcode?: string } }>('/pix/create', {
      method: 'POST', headers: { 'Idempotency-Key': `rj-${paymentId}` },
      body: JSON.stringify({
        amount: (amountCents / 100).toFixed(2), email: payerEmail, quantity: 1, discount: 0, tax: 0,
        invoice_no: paymentId, due_date: new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10),
        item_name: description.slice(0, 250), notes: description.slice(0, 480), document: doc, client: (payerName || payerEmail).slice(0, 190),
      }),
    });
    const qr = r.invoice.qrcode?.replace(/^data:image\/\w+;base64,/, '');
    return { providerRef: r.invoice.reference, pixCode: r.invoice.copy, pixQrBase64: qr, expiresAt: expires };
  },
  async createCard() { throw new Error('A SharkPay não está configurada para cartão.'); },
  async getStatus({ providerRef }) {
    const r = await sp<{ invoice: { status: string | number } }>(`/pix/invoice/${encodeURIComponent(providerRef)}`);
    return mapSp(r.invoice.status);
  },
  async refund() { /* sem API: reembolso manual no painel da SharkPay (a API registra o pedido na auditoria) */ },
  async parseWebhook({ headers, body, rawBody }) {
    if (!config.SHARKPAY_WEBHOOK_SECRET) throw new Error('SHARKPAY_WEBHOOK_SECRET não configurado');
    if (!rawBody || !verifySharkPaySignature(config.SHARKPAY_WEBHOOK_SECRET, String(headers['sharkpay-signature'] ?? ''), rawBody)) throw new Error('assinatura do webhook inválida');
    const e = body as { type?: string; data?: { invoice?: { reference?: string; invoice_no?: string; status?: string } } };
    const inv = e?.data?.invoice;
    if (!e?.type?.startsWith('invoice.') || !inv?.reference || !inv.invoice_no) return null;
    return { paymentId: inv.invoice_no, providerRef: inv.reference, status: mapSp(inv.status ?? '') };
  },
};

export const paymentProvider = (): PaymentProvider => (config.PAYMENT_PROVIDER === 'sharkpay' ? sharkPayProvider : config.PAYMENT_PROVIDER === 'mercadopago' ? mercadoPagoProvider : mockProvider);
