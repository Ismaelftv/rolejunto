// Ferramentas do admin: fotos de verificação (cofre), gestão de usuários, chamados e reembolsos manuais.
process.env.NODE_ENV = 'test';
process.env.VERIFICATION_MANUAL = 'true';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const VAULT = mkdtempSync(path.join(tmpdir(), 'rj-vault-'));
process.env.VAULT_DIR = VAULT;
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const { openDatabase } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { seed } = await import('../src/db/seed.js');
const { sentMail } = await import('../src/providers/messaging.js');

let app: FastifyInstance;
let close: () => Promise<void>;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

class Client {
  cookie = '';
  async raw(method: string, url: string, payload?: unknown) {
    const r = await app.inject({ method: method as 'GET', url: `/api${url}`, payload: payload as object, headers: this.cookie ? { cookie: this.cookie } : {} });
    const set = r.headers['set-cookie'];
    const c = (Array.isArray(set) ? set : set ? [set] : []).find((s) => s.startsWith('rj_session='));
    if (c) this.cookie = c.split(';')[0];
    return r;
  }
  async req(method: string, url: string, payload?: unknown) {
    const r = await this.raw(method, url, payload);
    return { status: r.statusCode, body: r.body && r.headers['content-type']?.toString().includes('json') ? JSON.parse(r.body) : null };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
  patch = (u: string, b: unknown = {}) => this.req('PATCH', u, b);
  del = (u: string, b?: unknown) => this.req('DELETE', u, b);
  async upload(url: string, files: string[]) {
    const boundary = '----rolejunto';
    const parts = files.map((f) => Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f}"; filename="${f}.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from('\r\n')]));
    const r = await app.inject({ method: 'POST', url: `/api${url}`, payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]), headers: { cookie: this.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` } });
    return { status: r.statusCode, body: JSON.parse(r.body) };
  }
}
const login = async (email: string, password = 'rolejunto123') => { const c = new Client(); const r = await c.post('/auth/login', { email, password }); assert.equal(r.status, 200, JSON.stringify(r.body)); return c; };
const lastCode = (to: string) => sentMail.filter((m) => m.to === to && /\b\d{6}\b/.test(m.text) && /código|code|验证码/i.test(m.subject + m.text)).at(-1)!.text.match(/\b(\d{6})\b/)![1];
async function newUser(email: string, name: string) {
  const c = new Client();
  const r = await c.post('/auth/signup', { name, email, password: 'senhasegura1', birthDate: '1995-01-01', acceptTerms: true, privacyConsent: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await c.post('/auth/verify-email', { code: lastCode(email) });
  return { c, id: r.body.user.id as string };
}

before(async () => {
  const database = await openDatabase({ memory: true });
  await seed(database.db, { quiet: true });
  app = await buildApp(database, { logger: false });
  close = async () => { await app.close(); await database.close(); };
});
after(async () => { await close(); });

describe('fotos de verificação', () => {
  test('o admin vê as imagens, ficam criptografadas e são apagadas ao decidir', async () => {
    const { c, id } = await newUser('verif.foto@x.com', 'Vera Foto');
    assert.equal((await c.upload('/verification', ['front', 'back', 'selfie'])).body.status, 'in_review');
    // em disco: arquivos criptografados (nada de PNG legível)
    const files = readdirSync(VAULT);
    assert.equal(files.length, 3);
    for (const f of files) { assert.ok(f.endsWith('.enc')); assert.ok(!readFileSync(path.join(VAULT, f)).includes(Buffer.from('PNG'))); }

    const adm = await login('admin@rolejunto.local');
    const item = (await adm.get('/admin/verifications')).body.items.find((v: { userId: string }) => v.userId === id);
    assert.equal(item.hasImages, true);
    for (const k of ['front', 'back', 'selfie']) {
      const r = await adm.raw('GET', `/admin/verifications/${item.id}/${k}`);
      assert.equal(r.statusCode, 200);
      assert.equal(r.headers['content-type'], 'image/png');
      assert.match(String(r.headers['cache-control']), /no-store/);
      assert.ok(r.rawPayload.equals(PNG));
    }
    // só admin; sem login nem cliente
    assert.equal((await c.get(`/admin/verifications/${item.id}/front`)).status, 403);
    assert.equal((await new Client().get(`/admin/verifications/${item.id}/front`)).status, 401);
    assert.equal((await adm.get(`/admin/verifications/${item.id}/outro`)).status, 400);
    // cada abertura fica no histórico
    assert.ok((await adm.get('/admin/audit')).body.items.some((a: { action: string }) => a.action === 'verification.view'));

    assert.equal((await adm.post(`/admin/verifications/${item.id}/approve`)).status, 200);
    assert.equal(readdirSync(VAULT).length, 0); // apagadas
    assert.equal((await adm.get(`/admin/verifications/${item.id}/front`)).status, 404);
    assert.equal((await c.get('/auth/me')).body.user.verification, 'verified');
  });

  test('enviar de novo depois de recusado funciona e exclusão da conta apaga as imagens', async () => {
    const { c, id } = await newUser('verif.rec@x.com', 'Rui Recusado');
    await c.upload('/verification', ['front', 'back', 'selfie']);
    const adm = await login('admin@rolejunto.local');
    const v = (await adm.get('/admin/verifications')).body.items.find((x: { userId: string }) => x.userId === id);
    await adm.post(`/admin/verifications/${v.id}/reject`);
    assert.equal(readdirSync(VAULT).length, 0);
    assert.equal((await c.upload('/verification', ['front', 'back', 'selfie'])).body.status, 'in_review');
    assert.equal(readdirSync(VAULT).length, 3);
    assert.equal((await adm.del(`/admin/users/${id}`, { confirm: true })).status, 200);
    assert.equal(readdirSync(VAULT).length, 0);
  });
});

describe('gestão de usuários pelo admin', () => {
  test('filtros, ficha, edição, e-mail repetido e acesso restrito', async () => {
    const adm = await login('admin@rolejunto.local');
    const parts = await adm.get('/admin/users?role=partner&limit=3');
    assert.equal(parts.status, 200);
    assert.ok(parts.body.total >= 5 && parts.body.items.length === 3 && parts.body.items.every((u: { role: string }) => u.role === 'partner'));
    const { c, id } = await newUser('edit.me@x.com', 'Edu Editável');
    const det = (await adm.get(`/admin/users/${id}`)).body;
    assert.equal(det.user.email, 'edit.me@x.com');
    assert.equal(det.user.emailVerified, true);
    assert.equal(det.stats.bookingsAsClient, 0);
    assert.equal(det.partner, null);

    const ed = await adm.patch(`/admin/users/${id}`, { name: 'Eduardo Editado', phone: '(11) 90000-0000', city: 'Santos', verification: 'verified' });
    assert.equal(ed.status, 200, JSON.stringify(ed.body));
    assert.deepEqual(ed.body.changed.sort(), ['city', 'name', 'phone', 'verification']);
    assert.equal((await c.get('/auth/me')).body.user.name, 'Eduardo Editado');
    assert.equal((await c.get('/auth/me')).body.user.verification, 'verified');
    assert.equal((await adm.patch(`/admin/users/${id}`, { email: 'marina@rolejunto.local' })).status, 409);
    // e-mail novo precisa ser confirmado de novo
    await adm.patch(`/admin/users/${id}`, { email: 'edit.novo@x.com' });
    assert.equal((await adm.get(`/admin/users/${id}`)).body.user.emailVerified, false);
    await adm.patch(`/admin/users/${id}`, { emailVerified: true });
    assert.equal((await adm.get(`/admin/users/${id}`)).body.user.emailVerified, true);
    // sem alterações: nada gravado
    assert.deepEqual((await adm.patch(`/admin/users/${id}`, { name: 'Eduardo Editado' })).body.changed, []);
    assert.equal((await adm.patch(`/admin/users/${id}`, { email: 'nao-e-email' })).status, 400);

    const outro = await login('cliente@rolejunto.local');
    for (const [m, u] of [['GET', '/admin/users'], ['GET', `/admin/users/${id}`], ['PATCH', `/admin/users/${id}`], ['DELETE', `/admin/users/${id}`], ['POST', `/admin/users/${id}/send-reset`], ['POST', `/admin/users/${id}/revoke-sessions`]] as const) {
      assert.equal((await outro.req(m, u, m === 'DELETE' ? { confirm: true } : {})).status, 403, `${m} ${u}`);
      assert.equal((await new Client().req(m, u, {})).status, 401, `${m} ${u} sem login`);
    }
  });

  test('exclusão pede confirmação, protege admins e anonimiza a conta', async () => {
    const adm = await login('admin@rolejunto.local');
    const { c, id } = await newUser('apagar@x.com', 'Ana Apagar');
    assert.equal((await adm.del(`/admin/users/${id}`)).status, 400); // sem confirm
    const admId = (await adm.get('/auth/me')).body.user.id;
    assert.equal((await adm.del(`/admin/users/${admId}`, { confirm: true })).status, 403);
    assert.equal((await adm.post(`/admin/users/${admId}/suspend`)).status, 403);
    assert.equal((await adm.del(`/admin/users/${id}`, { confirm: true, reason: 'pedido por e-mail' })).status, 200);
    assert.equal((await c.get('/auth/me')).body.user, null); // sessão encerrada
    assert.equal((await new Client().post('/auth/login', { email: 'apagar@x.com', password: 'senhasegura1' })).status, 401);
    const det = (await adm.get(`/admin/users/${id}`)).body.user;
    assert.equal(det.status, 'deleted');
    assert.equal(det.name, 'Usuário removido');
    assert.equal((await adm.del(`/admin/users/${id}`, { confirm: true })).status, 404); // já removida
    assert.ok((await adm.get('/admin/audit')).body.items.some((a: { action: string }) => a.action === 'user.delete_by_admin'));
    // parceira excluída sai da busca
    const jid = (await adm.get('/admin/users?q=Júlia')).body.items[0].id;
    assert.equal((await adm.del(`/admin/users/${jid}`, { confirm: true })).status, 200);
    assert.ok(!(await new Client().get('/partners?radiusKm=50&limit=50')).body.items.some((p: { name: string }) => p.name === 'Júlia'));
  });

  test('redefinição de senha por e-mail e desconexão de aparelhos', async () => {
    const adm = await login('admin@rolejunto.local');
    const { c, id } = await newUser('reset.adm@x.com', 'Rita Reset');
    const before = sentMail.length;
    assert.equal((await adm.post(`/admin/users/${id}/send-reset`)).status, 200);
    assert.ok(sentMail.slice(before).some((m) => m.to === 'reset.adm@x.com'));
    assert.equal((await adm.post(`/admin/users/${id}/revoke-sessions`)).status, 200);
    assert.equal((await c.get('/auth/me')).body.user, null);
  });
});

describe('chamados de suporte e reembolsos manuais', () => {
  test('o usuário abre o chamado, o admin responde e o usuário vê a resposta', async () => {
    const { c, id } = await newUser('chamado@x.com', 'Cris Chamado');
    const r = await c.post('/support', { subject: 'booking_payment', message: 'Meu pagamento não apareceu na reserva.', bookingId: '00000000-0000-4000-8000-000000000000' });
    assert.equal(r.status, 201);
    const adm = await login('admin@rolejunto.local');
    const list = (await adm.get('/admin/support')).body.items;
    const t = list.find((x: { userId: string }) => x.userId === id);
    assert.equal(t.status, 'open');
    assert.equal(t.bookingId, null); // reserva que não é dele não vincula
    assert.equal(t.protocol, r.body.ticket.protocol);
    const before = sentMail.length;
    const rep = await adm.post(`/admin/support/${t.id}/reply`, { message: 'Já localizamos o pagamento, está tudo certo.' });
    assert.equal(rep.status, 200);
    assert.ok(sentMail.slice(before).some((m) => m.to === 'chamado@x.com' && m.text.includes('localizamos')));
    const mine = (await c.get('/me/tickets')).body.items;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'closed');
    assert.match(mine[0].reply, /localizamos/);
    assert.ok((await c.get('/notifications')).body.items.some((n: { type: string }) => n.type === 'support_reply'));
    assert.equal((await adm.get('/admin/support?status=open')).body.items.some((x: { id: string }) => x.id === t.id), false);
    // cliente comum não lê a caixa de entrada nem responde
    assert.equal((await c.get('/admin/support')).status, 403);
    assert.equal((await c.post(`/admin/support/${t.id}/reply`, { message: 'oi' })).status, 403);
    // um usuário só vê os próprios chamados
    const outro = (await newUser('chamado2@x.com', 'Dani Dois')).c;
    assert.equal((await outro.get('/me/tickets')).body.items.length, 0);
  });

  test('lista de reembolsos manuais: só admin e vazia quando nada foi pago pela SharkPay', async () => {
    const adm = await login('admin@rolejunto.local');
    assert.deepEqual((await adm.get('/admin/refunds')).body.items, []);
    assert.equal((await adm.post('/admin/refunds/00000000-0000-4000-8000-000000000000/done')).status, 404);
    assert.equal((await (await login('cliente@rolejunto.local')).get('/admin/refunds')).status, 403);
  });
});
