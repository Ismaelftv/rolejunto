// Provedores de pagamento. Troque PAYMENT_PROVIDER=mercadopago em produção.
import { createHmac, randomUUID } from 'node:crypto';
import { config } from '../config.js';

export interface PixCharge { providerRef: string; pixCode: string; pixQrBase64?: string; expiresAt: Date }
export interface CardCheckout { providerRef: string; checkoutUrl: string }
export type ProviderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PaymentProvider {
  name: string;
  createPix(p: { paymentId: string; amountCents: number; description: string; payerEmail: string }): Promise<PixCharge>;
  createCard(p: { paymentId: string; amountCents: number; description: string; payerEmail: string; returnUrl: string }): Promise<CardCheckout>;
  /** Consulta a situação no provedor (usado quando o cliente toca em "Já paguei"). */
  getStatus(p: { providerRef: string; paymentId: string; method: 'pix' | 'card' }): Promise<ProviderStatus>;
  refund(p: { providerRef: string; amountCents: number }): Promise<void>;
  /** Valida e interpreta o aviso (webhook) do provedor. Retorna null se não for um evento de pagamento. */
  parseWebhook(p: { headers: Record<string, string | string[] | undefined>; body: unknown; query: Record<string, string> }): Promise<{ paymentId: string; providerRef: string; status: ProviderStatus } | null>;
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

export const paymentProvider = (): PaymentProvider => (config.PAYMENT_PROVIDER === 'mercadopago' ? mercadoPagoProvider : mockProvider);
