// Provedor SharkPay: autenticação, criação do Pix, consulta e assinatura do webhook (sem rede: fetch simulado).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.SHARKPAY_PUBLIC_KEY = 'pk_test';
process.env.SHARKPAY_SECRET_KEY = 'sk_test';
process.env.SHARKPAY_WEBHOOK_SECRET = 'whsec_test';
process.env.SHARKPAY_PAYER_DOCUMENT = '12.345.678/0001-90';
process.env.SHARKPAY_URL = 'https://sharkpay.test';
const { sharkPayProvider, verifySharkPaySignature } = await import('../src/providers/payments.js');

const sign = (secret: string, t: number, body: string) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('SharkPay', () => {
  test('cria o Pix com autenticação e devolve copia-e-cola', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/auth')) return new Response(JSON.stringify({ success: { token: 'tok', expires_in: 2592000 } }), { status: 200 });
      return new Response(JSON.stringify({ invoice: { reference: 'INV-ABC123', copy: '000201pix', qrcode: 'data:image/png;base64,QUJD' } }), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await sharkPayProvider.createPix({ paymentId: 'pay-1', amountCents: 17820, description: 'RolêJunto · reserva', payerEmail: 'a@b.com', payerName: 'Ana' });
      assert.equal(r.providerRef, 'INV-ABC123');
      assert.equal(r.pixCode, '000201pix');
      assert.equal(r.pixQrBase64, 'QUJD');
      assert.equal(calls[0].url, 'https://sharkpay.test/api/auth');
      assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from('pk_test:sk_test').toString('base64')}`);
      const sent = JSON.parse(String(calls[1].init.body));
      assert.equal(sent.amount, '178.20');
      assert.equal(sent.invoice_no, 'pay-1');
      assert.equal(sent.document, '12345678000190');
      assert.equal((calls[1].init.headers as Record<string, string>)['Idempotency-Key'], 'rj-pay-1');
    } finally { globalThis.fetch = orig; }
  });

  test('consulta a situação da cobrança', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => String(url).endsWith('/api/auth')
      ? new Response(JSON.stringify({ success: { token: 'tok' } }), { status: 200 })
      : new Response(JSON.stringify({ invoice: { status: 1 } }), { status: 200 })) as typeof fetch;
    try { assert.equal(await sharkPayProvider.getStatus({ providerRef: 'INV-ABC123', paymentId: 'x', method: 'pix' }), 'paid'); }
    finally { globalThis.fetch = orig; }
  });

  test('webhook: assinatura válida confirma; inválida ou antiga é recusada', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { invoice: { reference: 'INV-ABC123', invoice_no: 'pay-1', status: 'PAID' } } });
    const t = Math.floor(Date.now() / 1000);
    const ok = await sharkPayProvider.parseWebhook({ headers: { 'sharkpay-signature': sign('whsec_test', t, body) }, body: JSON.parse(body), query: {}, rawBody: body });
    assert.deepEqual(ok, { paymentId: 'pay-1', providerRef: 'INV-ABC123', status: 'paid' });
    await assert.rejects(sharkPayProvider.parseWebhook({ headers: { 'sharkpay-signature': sign('outro', t, body) }, body: JSON.parse(body), query: {}, rawBody: body }));
    await assert.rejects(sharkPayProvider.parseWebhook({ headers: { 'sharkpay-signature': sign('whsec_test', t - 3600, body) }, body: JSON.parse(body), query: {}, rawBody: body }));
    assert.equal(verifySharkPaySignature('whsec_test', 'lixo', body), false);
    const ping = JSON.stringify({ id: 'evt_2', type: 'ping', data: {} });
    assert.equal(await sharkPayProvider.parseWebhook({ headers: { 'sharkpay-signature': sign('whsec_test', t, ping) }, body: JSON.parse(ping), query: {}, rawBody: ping }), null);
  });
});
