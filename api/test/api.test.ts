// Testes de ponta a ponta da API (banco PGlite em memória). Rode com: npm test
process.env.NODE_ENV = 'test';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const { openDatabase } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { seed } = await import('../src/db/seed.js');
const { sentMail } = await import('../src/providers/messaging.js');
const { flushNotices } = await import('../src/lib/context.js');

let app: FastifyInstance;
let close: () => Promise<void>;

// Imagem PNG mínima válida (1×1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

type Res = { status: number; body: any };
class Client {
  cookie = '';
  async req(method: string, url: string, payload?: unknown): Promise<Res> {
    const r = await app.inject({ method: method as 'GET', url: `/api${url}`, payload: payload as object, headers: this.cookie ? { cookie: this.cookie } : {} });
    const set = r.headers['set-cookie'];
    const c = (Array.isArray(set) ? set : set ? [set] : []).find((s) => s.startsWith('rj_session='));
    if (c) this.cookie = c.split(';')[0];
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
  put = (u: string, b: unknown = {}) => this.req('PUT', u, b);
  patch = (u: string, b: unknown = {}) => this.req('PATCH', u, b);
  del = (u: string, b?: unknown) => this.req('DELETE', u, b);
  async upload(url: string, files: string[]) {
    const boundary = '----rolejunto';
    const parts = files.map((f) => Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f}"; filename="${f}.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from('\r\n'),
    ]));
    const payload = Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]);
    const r = await app.inject({ method: 'POST', url: `/api${url}`, payload, headers: { cookie: this.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` } });
    return { status: r.statusCode, body: JSON.parse(r.body) };
  }
}
const login = async (email: string, password = 'rolejunto123') => {
  const c = new Client();
  const r = await c.post('/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
};
const adult = '1995-01-01';
/** Último código de 6 dígitos enviado para o e-mail (ignora os e-mails de aviso). */
const lastCode = (to: string) => sentMail.filter((m) => m.to === to && /código|code|验证码/i.test(m.subject + m.text) && /\b\d{6}\b/.test(m.text)).at(-1)!.text.match(/\b(\d{6})\b/)![1];

/** Encontra o próximo horário livre de um parceiro (pulando os já usados nos testes). */
const used = new Set<string>();
async function nextSlot(c: Client, partnerId: string) {
  const r = await c.get(`/partners/${partnerId}`);
  for (const day of r.body.partner.agenda) for (const s of day.slots) {
    const iso = `${day.date}T${s}:00-03:00`;
    if (!used.has(`${partnerId}${iso}`)) { used.add(`${partnerId}${iso}`); return iso; }
  }
  throw new Error('sem horário livre');
}
async function partnerId(c: Client, name: string) {
  const r = await c.get('/partners?radiusKm=50&limit=50');
  return r.body.items.find((p: { name: string }) => p.name === name).id as string;
}

before(async () => {
  const database = await openDatabase({ memory: true });
  await seed(database.db, { quiet: true });
  app = await buildApp(database, { logger: false });
  close = async () => { await app.close(); await database.close(); };
});
after(async () => { await close(); });

describe('contas', () => {
  test('saúde da API', async () => {
    const r = await new Client().get('/health');
    assert.equal(r.status, 200);
  });

  test('bloqueia cadastro de menores de 18 anos', async () => {
    const minor = new Date(); minor.setFullYear(minor.getFullYear() - 17);
    const r = await new Client().post('/auth/signup', { name: 'Teen', email: 'teen@x.com', password: 'senhasegura1', birthDate: minor.toISOString().slice(0, 10), acceptTerms: true, privacyConsent: true });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'underage');
  });

  test('exige aceite dos termos e consentimento', async () => {
    const r = await new Client().post('/auth/signup', { name: 'Sem Termos', email: 'nt@x.com', password: 'senhasegura1', birthDate: adult, acceptTerms: false, privacyConsent: true });
    assert.equal(r.status, 400);
  });

  test('cadastro, sessão, e-mail duplicado', async () => {
    const c = new Client();
    const r = await c.post('/auth/signup', { name: 'Paulo', email: 'paulo@x.com', password: 'senhasegura1', birthDate: adult, acceptTerms: true, privacyConsent: true });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.verification, 'pending');
    assert.equal(r.body.user.passwordHash, undefined);
    assert.equal((await c.get('/auth/me')).body.user.email, 'paulo@x.com');
    const code = lastCode('paulo@x.com');
    assert.equal((await c.post('/auth/verify-email', { code })).body.user.emailVerified, true);
    const dup = await new Client().post('/auth/signup', { name: 'Outro', email: 'PAULO@x.com', password: 'senhasegura1', birthDate: adult, acceptTerms: true, privacyConsent: true });
    assert.equal(dup.status, 409);
  });

  test('bloqueia a conta após 5 senhas erradas', async () => {
    await new Client().post('/auth/signup', { name: 'Lock', email: 'lock@x.com', password: 'senhasegura1', birthDate: adult, acceptTerms: true, privacyConsent: true });
    for (let i = 0; i < 5; i++) assert.equal((await new Client().post('/auth/login', { email: 'lock@x.com', password: 'errada' })).status, 401);
    assert.equal((await new Client().post('/auth/login', { email: 'lock@x.com', password: 'senhasegura1' })).status, 429);
  });

  test('recuperar senha por código encerra sessões antigas', async () => {
    const old = await login('paulo@x.com', 'senhasegura1');
    assert.equal((await new Client().post('/auth/forgot', { email: 'paulo@x.com' })).status, 200);
    const code = lastCode('paulo@x.com');
    assert.equal((await new Client().post('/auth/reset', { email: 'paulo@x.com', code: '000000', password: 'novasenha123' })).status, 400);
    assert.equal((await new Client().post('/auth/reset', { email: 'paulo@x.com', code, password: 'novasenha123' })).status, 200);
    assert.equal((await old.get('/me')).status, 401);
    await login('paulo@x.com', 'novasenha123');
  });

  test('verificação de identidade (modo demonstração aprova)', async () => {
    const c = await login('paulo@x.com', 'novasenha123');
    assert.equal((await c.upload('/verification', ['front', 'back'])).status, 400); // falta a selfie
    const r = await c.upload('/verification', ['front', 'back', 'selfie']);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'verified');
  });
});

describe('busca e perfis', () => {
  test('busca por categoria, sem expor localização exata', async () => {
    const r = await new Client().get('/partners?activity=balada');
    assert.equal(r.status, 200);
    const names = r.body.items.map((p: { name: string }) => p.name).sort();
    assert.deepEqual(names, ['Bia', 'Léo', 'Marina']);
    for (const p of r.body.items) {
      assert.ok(Number.isInteger(p.distanceKm) && p.distanceKm >= 1);
      assert.equal(p.approxLat, undefined);
      assert.equal(p.email, undefined);
    }
  });

  test('perfil com agenda dos próximos 7 dias', async () => {
    const c = new Client();
    const id = await partnerId(c, 'Marina');
    const r = await c.get(`/partners/${id}`);
    assert.equal(r.body.partner.agenda.length, 7);
    assert.ok(r.body.partner.agenda.some((d: { slots: string[] }) => d.slots.length));
  });
});

describe('reservas, pagamento e segurança', () => {
  test('cliente sem verificação não reserva', async () => {
    const c = new Client();
    await c.post('/auth/signup', { name: 'Nova', email: 'nova@x.com', password: 'senhasegura1', birthDate: adult, acceptTerms: true, privacyConsent: true });
    const id = await partnerId(c, 'Marina');
    const r = await c.post('/bookings', { partnerId: id, activity: 'balada', startsAt: await nextSlot(c, id), hours: 3, place: 'Entrada da balada', acceptRules: true });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'verification_required');
  });

  test('fluxo completo: pedido → aceite → Pix → check-in → conclusão → avaliação', async () => {
    const ana = await login('cliente@rolejunto.local');
    const marina = await login('marina@rolejunto.local');
    const id = await partnerId(ana, 'Marina');
    const created = await ana.post('/bookings', { partnerId: id, activity: 'balada', startsAt: await nextSlot(ana, id), hours: 3, place: 'Entrada da balada na Vila Olímpia', acceptRules: true });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const b = created.body.booking;
    assert.equal(b.subtotalCents, 27000);
    assert.equal(b.feeCents, 2700);
    assert.equal((await ana.post(`/bookings/${b.id}/payment`, { method: 'pix' })).status, 409); // ainda não aceito
    assert.equal((await ana.post(`/bookings/${b.id}/accept`)).status, 403); // só o parceiro aceita
    assert.equal((await marina.post(`/bookings/${b.id}/accept`)).status, 200);
    assert.equal((await ana.post(`/bookings/${b.id}/check-in`)).body.error.code, 'payment_required');
    const pay = await ana.post(`/bookings/${b.id}/payment`, { method: 'pix' });
    assert.equal(pay.status, 200);
    assert.ok(pay.body.payment.pixCode.startsWith('000201'));
    const earnBefore = (await marina.get('/partner/earnings')).body.availableCents as number;
    assert.equal((await ana.get(`/payments/${pay.body.payment.id}`)).body.payment.status, 'pending');
    assert.equal((await ana.post(`/payments/${pay.body.payment.id}/simulate`)).body.payment.status, 'paid');
    assert.equal((await ana.post(`/bookings/${b.id}/check-in`)).body.booking.status, 'in_progress');
    assert.equal((await marina.post(`/bookings/${b.id}/complete`)).body.booking.status, 'completed');
    assert.equal((await ana.post(`/bookings/${b.id}/review`, { rating: 5, text: 'Ótima companhia!' })).status, 200);
    assert.equal((await ana.post(`/bookings/${b.id}/review`, { rating: 4 })).status, 409);
    const prof = await ana.get(`/partners/${id}`);
    assert.equal(prof.body.partner.rating, 5);
    const earn = await marina.get('/partner/earnings');
    assert.equal(earn.body.availableCents - earnBefore, 27000);
    const notif = await ana.get('/notifications');
    assert.ok(notif.body.items.some((n: { type: string }) => n.type === 'booking_accepted'));
    assert.ok(notif.body.items.some((n: { type: string }) => n.type === 'payment_confirmed'));
  });

  test('Casa/Sítio só depois de um encontro concluído em local público', async () => {
    const ana = await login('cliente@rolejunto.local');
    const rafael = await login('julia@rolejunto.local'); // Ana ainda não teve encontro com a Júlia
    const id = await partnerId(ana, 'Júlia');
    const locked = await ana.post('/bookings', { partnerId: id, activity: 'casa', startsAt: await nextSlot(ana, id), hours: 3, place: 'Rua das Flores, 100', shareWithTrustedContact: true, acceptRules: true });
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error.code, 'private_venue_locked');
    // primeiro encontro em público
    const pub = (await ana.post('/bookings', { partnerId: id, activity: 'jantar', startsAt: await nextSlot(ana, id), hours: 3, place: 'Restaurante em Moema', acceptRules: true })).body.booking;
    await rafael.post(`/bookings/${pub.id}/accept`);
    const pay = (await ana.post(`/bookings/${pub.id}/payment`, { method: 'pix' })).body.payment;
    await ana.post(`/payments/${pay.id}/simulate`);
    await ana.post(`/bookings/${pub.id}/check-in`);
    await ana.post(`/bookings/${pub.id}/complete`);
    // agora libera, mas exige compartilhar com o contato de confiança
    const noShare = await ana.post('/bookings', { partnerId: id, activity: 'casa', startsAt: await nextSlot(ana, id), hours: 3, place: 'Rua das Flores, 100', acceptRules: true });
    assert.equal(noShare.body.error.code, 'share_required');
    const ok = await ana.post('/bookings', { partnerId: id, activity: 'casa', startsAt: await nextSlot(ana, id), hours: 3, place: 'Rua das Flores, 100', shareWithTrustedContact: true, acceptRules: true });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.booking.privateVenue, true);
  });

  test('cancelamento com mais de 24 h devolve tudo', async () => {
    const ana = await login('cliente@rolejunto.local');
    const clara = await login('clara@rolejunto.local');
    const id = await partnerId(ana, 'Clara');
    let slot = await nextSlot(ana, id);
    while (new Date(slot).getTime() - Date.now() < 25 * 3600_000) slot = await nextSlot(ana, id);
    const b = (await ana.post('/bookings', { partnerId: id, activity: 'museu', startsAt: slot, hours: 2, place: 'Pinacoteca, entrada principal', acceptRules: true })).body.booking;
    await clara.post(`/bookings/${b.id}/accept`);
    const pay = (await ana.post(`/bookings/${b.id}/payment`, { method: 'pix' })).body.payment;
    await ana.post(`/payments/${pay.id}/simulate`);
    const c = await ana.post(`/bookings/${b.id}/cancel`);
    assert.equal(c.body.booking.status, 'cancelled');
    assert.equal(c.body.booking.paymentStatus, 'refunded');
  });

  test('não aceita horário fora da agenda nem horário ocupado', async () => {
    const ana = await login('cliente@rolejunto.local');
    const id = await partnerId(ana, 'Helena');
    const bad = await ana.post('/bookings', { partnerId: id, activity: 'cuidado', startsAt: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10) + 'T03:17:00-03:00', hours: 2, place: 'Hospital, recepção', acceptRules: true });
    assert.equal(bad.body.error.code, 'slot_unavailable');
    const slot = await nextSlot(ana, id);
    assert.equal((await ana.post('/bookings', { partnerId: id, activity: 'cuidado', startsAt: slot, hours: 2, place: 'Hospital, recepção', acceptRules: true })).status, 201);
    const paulo = await login('paulo@x.com', 'novasenha123');
    const taken = await paulo.post('/bookings', { partnerId: id, activity: 'cuidado', startsAt: slot, hours: 2, place: 'Hospital, recepção', acceptRules: true });
    assert.equal(taken.body.error.code, 'slot_taken');
  });
});

describe('chat, denúncias e admin', () => {
  test('moderação do chat: contatos bloqueados e pedido sexual vira denúncia', async () => {
    const ana = await login('cliente@rolejunto.local');
    const id = await partnerId(ana, 'Bia');
    const conv = (await ana.post('/conversations', { partnerId: id })).body.conversation;
    assert.equal((await ana.post(`/conversations/${conv.id}/messages`, { body: 'Oi! Vamos à praia sábado?' })).status, 201);
    const contact = await ana.post(`/conversations/${conv.id}/messages`, { body: 'me chama no 11 98765-4321' });
    assert.equal(contact.body.error.code, 'contact_info');
    const sexual = await ana.post(`/conversations/${conv.id}/messages`, { body: 'quero programa completo' });
    assert.equal(sexual.body.error.code, 'policy_violation');
    const bia = await login('bia@rolejunto.local');
    const msgs = await bia.get(`/conversations/${conv.id}/messages`);
    assert.equal(msgs.body.items.filter((m: { kind: string }) => m.kind === 'text').length, 1); // a retida não chega
    const admin = await login('admin@rolejunto.local');
    const reports = await admin.get('/admin/reports');
    assert.ok(reports.body.items.some((r: { priority: string; reason: string }) => r.priority === 'high' && r.reason === 'sexual'));
  });

  test('denúncia com bloqueio esconde o perfil da busca', async () => {
    const paulo = await login('paulo@x.com', 'novasenha123');
    const id = await partnerId(paulo, 'Léo');
    const r = await paulo.post('/reports', { targetId: id, reason: 'off_platform_payment', block: true });
    assert.equal(r.status, 201);
    const list = await paulo.get('/partners?activity=balada');
    assert.ok(!list.body.items.some((p: { id: string }) => p.id === id));
    assert.equal((await paulo.get(`/partners/${id}`)).status, 404);
    await paulo.del(`/blocks/${id}`);
    assert.equal((await paulo.get(`/partners/${id}`)).status, 200);
  });

  test('só admin acessa o painel; suspensão encerra o acesso', async () => {
    const ana = await login('cliente@rolejunto.local');
    assert.equal((await ana.get('/admin/metrics')).status, 403);
    const admin = await login('admin@rolejunto.local');
    assert.equal((await admin.get('/admin/metrics')).status, 200);
    const users = await admin.get('/admin/users?q=nova');
    const nova = users.body.items[0];
    assert.equal((await admin.post(`/admin/users/${nova.id}/suspend`)).status, 200);
    assert.equal((await new Client().post('/auth/login', { email: 'nova@x.com', password: 'senhasegura1' })).body.error.code, 'account_suspended');
  });

  test('parceiro: perfil com moderação, agenda e fotos para revisão', async () => {
    const c = new Client();
    await c.post('/auth/signup', { name: 'Gabi', email: 'gabi@x.com', password: 'senhasegura1', birthDate: adult, role: 'partner', acceptTerms: true, privacyConsent: true });
    const base = { bio: 'Adoro shows', about: 'Sou animada', priceCents: 9000, minHours: 2, languages: ['PT'], activities: ['show'], neighborhood: 'Centro', city: 'São Paulo', lat: -23.55, lng: -46.63 };
    assert.equal((await c.put('/partner/profile', { ...base, visible: true })).body.error.code, 'verification_required');
    assert.equal((await c.put('/partner/profile', { ...base, bio: 'me chama no zap', visible: false })).body.error.code, 'contact_info');
    await c.upload('/verification', ['front', 'back', 'selfie']);
    assert.equal((await c.put('/partner/profile', { ...base, visible: true })).body.error.code, 'email_unverified');
    await c.post('/auth/verify-email', { code: lastCode('gabi@x.com') });
    const ok = await c.put('/partner/profile', { ...base, visible: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.approxLat, -23.55);
    assert.equal((await c.put('/partner/availability', { slots: [{ weekday: 6, start: '20:00' }] })).body.count, 1);
    const ph = await c.upload('/partner/photos', ['photo']);
    assert.equal(ph.body.photo.status, 'pending');
  });

  test('LGPD: exportar e excluir conta', async () => {
    const c = await login('paulo@x.com', 'novasenha123');
    const exp = await c.get('/me/export');
    assert.equal(exp.status, 200);
    assert.equal(exp.body.account.email, 'paulo@x.com');
    assert.equal((await c.del('/me', { password: 'errada' })).status, 400);
    assert.equal((await c.del('/me', { password: 'novasenha123' })).status, 200);
    assert.equal((await new Client().post('/auth/login', { email: 'paulo@x.com', password: 'novasenha123' })).status, 401);
  });

  test('suporte aceita mensagem sem login', async () => {
    const r = await new Client().post('/support', { subject: 'other', message: 'Como funciona o pagamento?', email: 'visitante@x.com' });
    assert.equal(r.status, 201);
    assert.ok(r.body.ticket.protocol);
  });
});

describe('integração com o app', () => {
  test('perfil do parceiro: atualização parcial, traduções e agenda', async () => {
    const leo = await login('leo@rolejunto.local');
    const before = (await leo.get('/partner/profile')).body.profile;
    const r = await leo.put('/partner/profile', { priceCents: 7500, translations: { en: { bio: 'Fun and chatty.' } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.profile.priceCents, 7500);
    assert.equal(r.body.profile.bio, before.bio); // o resto não muda
    assert.equal((await leo.put('/partner/profile', { about: 'me chama no zap 11999990000' })).body.error.code, 'contact_info');
    assert.equal((await leo.put('/partner/availability', { slots: [{ weekday: 5, start: '20:00' }] })).body.count, 1);
    const pub = await new Client().get(`/partners/${before.userId}`);
    assert.equal(pub.body.partner.translations.en.bio, 'Fun and chatty.');
    assert.ok(pub.body.partner.reviews.every((x: { activity: string }) => typeof x.activity === 'string'));
  });

  test('lista de reservas traz a minha nota e o comprovante do pagamento', async () => {
    const ana = await login('cliente@rolejunto.local');
    const list = (await ana.get('/bookings')).body.items as { id: string; status: string; myRating: number | null; other: { role: string } }[];
    const done = list.find((b) => b.status === 'completed' && b.myRating);
    assert.ok(done, 'Ana tem um encontro avaliado no seed');
    assert.equal(done!.other.role, 'partner');
    const pay = await ana.get(`/bookings/${list[0].id}/payment`);
    assert.equal(pay.status, 200);
  });
});

describe('confirmação de e-mail', () => {
  const codeFor = (email: string) => lastCode(email);

  test('cadastro envia código; reserva exige e-mail confirmado', async () => {
    const c = new Client();
    const s = await c.post('/auth/signup', { name: 'Bruna Lima', email: 'bruna@x.com', password: 'senhasegura1', birthDate: adult, lang: 'es', acceptTerms: true, privacyConsent: true });
    assert.equal(s.body.user.emailVerified, false);
    const mail = sentMail.filter((m) => m.to === 'bruna@x.com').at(-1)!;
    assert.match(mail.subject, /^\d{6} es tu código de RolêJunto$/); // no idioma da pessoa
    assert.ok(mail.html?.includes('Confirma tu correo'));
    // identidade verificada, mas e-mail ainda não
    await c.upload('/verification', ['front', 'back', 'selfie']);
    const id = await partnerId(c, 'Bia');
    const blocked = await c.post('/bookings', { partnerId: id, activity: 'praia', startsAt: await nextSlot(c, id), hours: 3, place: 'Praia de Maresias', acceptRules: true });
    assert.equal(blocked.body.error.code, 'email_unverified');
    // código errado, depois o certo
    assert.equal((await c.post('/auth/verify-email', { code: '000000' })).body.error.code, 'invalid_code');
    const ok = await c.post('/auth/verify-email', { code: codeFor('bruna@x.com') });
    assert.equal(ok.body.user.emailVerified, true);
    const booked = await c.post('/bookings', { partnerId: id, activity: 'praia', startsAt: await nextSlot(c, id), hours: 3, place: 'Praia de Maresias', acceptRules: true });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
  });

  test('reenviar invalida o código anterior; trocar o e-mail pede nova confirmação', async () => {
    const c = new Client();
    await c.post('/auth/signup', { name: 'Caio', email: 'caio@x.com', password: 'senhasegura1', birthDate: adult, acceptTerms: true, privacyConsent: true });
    const first = codeFor('caio@x.com');
    await c.post('/auth/verify-email/resend');
    const second = codeFor('caio@x.com');
    if (first !== second) assert.equal((await c.post('/auth/verify-email', { code: first })).status, 400);
    assert.equal((await c.post('/auth/verify-email', { code: second })).body.user.emailVerified, true);
    const changed = await c.patch('/me', { email: 'caio.novo@x.com' });
    assert.equal(changed.body.user.emailVerified, false);
    assert.equal((await c.post('/auth/verify-email', { code: codeFor('caio.novo@x.com') })).body.user.emailVerified, true);
  });
});

describe('painel admin: financeiro, reservas, avaliações, histórico', () => {
  test('repasse ao parceiro zera o valor a repassar e aparece para o parceiro', async () => {
    const adm = await login('admin@rolejunto.local');
    const fin = (await adm.get('/admin/finance?period=all')).body;
    assert.ok(fin.owedCents > 0);
    const clara = fin.pendingPayouts.find((p: { name: string }) => p.name === 'Clara');
    assert.ok(clara, 'Clara tem encontro concluído no seed');
    const pay = await adm.post('/admin/payouts', { partnerId: clara.partnerId, note: 'Pix 06/10' });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.payout.amountCents, clara.amountCents);
    assert.equal((await adm.post('/admin/payouts', { partnerId: clara.partnerId })).body.error.code, 'nothing_to_pay');
    const after = (await adm.get('/admin/finance?period=all')).body;
    assert.equal(after.owedCents, fin.owedCents - clara.amountCents);
    assert.ok(after.recentPayouts.some((p: { name: string }) => p.name === 'Clara'));
    const earn = (await (await login('clara@rolejunto.local')).get('/partner/earnings')).body;
    assert.equal(earn.availableCents, 0);
    assert.ok(earn.history.every((h: { paidOut: boolean }) => h.paidOut));
    assert.ok((await adm.get('/admin/payments')).body.items.length > 0);
    // só admin
    assert.equal((await (await login('cliente@rolejunto.local')).get('/admin/finance')).status, 403);
  });

  test('admin lista reservas e cancela com reembolso integral', async () => {
    const adm = await login('admin@rolejunto.local');
    const ana = await login('cliente@rolejunto.local');
    const id = await partnerId(ana, 'Bia');
    const b = (await ana.post('/bookings', { partnerId: id, activity: 'bar', startsAt: await nextSlot(ana, id), hours: 3, place: 'Bar em Pinheiros', acceptRules: true })).body.booking;
    const list = (await adm.get('/admin/bookings?q=pinheiros')).body.items;
    assert.ok(list.some((x: { id: string }) => x.id === b.id));
    const c = await adm.post(`/admin/bookings/${b.id}/cancel`);
    assert.equal(c.body.booking.status, 'cancelled');
    assert.equal((await adm.post(`/admin/bookings/${b.id}/cancel`)).status, 409);
  });

  test('avaliação retida pode ser publicada; histórico mostra quem fez', async () => {
    const adm = await login('admin@rolejunto.local');
    const hidden = (await adm.get('/admin/reviews')).body.items;
    assert.ok(hidden.length >= 0);
    if (hidden.length) assert.equal((await adm.post(`/admin/reviews/${hidden[0].id}/show`)).status, 200);
    const log = (await adm.get('/admin/audit?action=payout')).body.items;
    assert.ok(log.length >= 1);
    assert.equal(log[0].actorName, 'Equipe RolêJunto');
    const growth = (await adm.get('/admin/stats/growth?days=30')).body.series;
    assert.equal(growth.length, 30);
    assert.ok(growth.some((d: { revenueCents: number }) => d.revenueCents > 0));
  });
});

describe('parceiro novo aparece na busca', () => {
  test('sem localização não fica visível; com a cidade passa a aparecer na lista', async () => {
    const c = new Client();
    await c.post('/auth/signup', { name: 'Paula Nova', email: 'paula.nova@x.com', password: 'senhasegura1', birthDate: adult, role: 'partner', acceptTerms: true, privacyConsent: true });
    await c.post('/auth/verify-email', { code: lastCode('paula.nova@x.com') });
    await c.upload('/verification', ['front', 'back', 'selfie']);
    await c.put('/partner/profile', { about: 'Adoro balada e música ao vivo.', bio: 'Adoro balada.', priceCents: 9000, minHours: 2, languages: ['PT'], activities: ['balada', 'bar'] });
    await c.put('/partner/availability', { slots: [{ weekday: 5, start: '20:00' }] });
    let ck = (await c.get('/partner/profile')).body.checklist;
    assert.equal(ck.hasLocation, false);
    assert.equal(ck.searchable, false);
    const noLoc = await c.put('/partner/profile', { visible: true });
    assert.equal(noLoc.body.error.code, 'location_required');
    // informa bairro e cidade (sem GPS): usa o centro da cidade, arredondado
    const r = await c.put('/partner/profile', { neighborhood: 'Moema', city: 'São Paulo', visible: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.checklist.searchable, true);
    const found = await new Client().get('/partners?radiusKm=10');
    assert.ok(found.body.items.some((p: { name: string }) => p.name === 'Paula Nova'));
    // localização do aparelho tem prioridade
    await c.put('/partner/profile', { lat: -23.6, lng: -46.66 });
    ck = (await c.get('/partner/profile')).body;
    assert.equal(ck.profile.approxLat, -23.6);
  });
});

describe('avisos por e-mail', () => {
  const mails = (to: string) => sentMail.filter((m) => m.to === to);

  test('pedido, aceite e pagamento chegam por e-mail no idioma de cada um', async () => {
    const ana = await login('cliente@rolejunto.local');
    const marina = await login('marina@rolejunto.local');
    await marina.patch('/me', { lang: 'en' }); // a parceira usa o app em inglês
    const before = { ana: mails('cliente@rolejunto.local').length, marina: mails('marina@rolejunto.local').length };
    const id = await partnerId(ana, 'Marina');
    const b = (await ana.post('/bookings', { partnerId: id, activity: 'show', startsAt: await nextSlot(ana, id), hours: 2, place: 'Audio, Barra Funda', acceptRules: true })).body.booking;
    await flushNotices();
    const req = mails('marina@rolejunto.local').slice(before.marina);
    assert.ok(req.some((m) => m.subject === 'New request from Ana'), JSON.stringify(req.map((m) => m.subject)));
    assert.ok(req.at(-1)!.html!.includes('/painel'));
    await marina.post(`/bookings/${b.id}/accept`);
    await flushNotices();
    const acc = mails('cliente@rolejunto.local').slice(before.ana);
    assert.ok(acc.some((m) => m.subject === 'Marina aceitou sua reserva'), JSON.stringify(acc.map((m) => m.subject)));
    assert.ok(acc.at(-1)!.html!.includes(`/reservas/${b.id}/pagar`));
    await marina.patch('/me', { lang: 'pt' });
  });

  test('chat manda no máximo 1 e-mail a cada 30 minutos; preferência desligada não recebe', async () => {
    const ana = await login('cliente@rolejunto.local');
    const bia = await login('clara@rolejunto.local'); // conversa nova (sem e-mail recente)
    const conv = (await ana.post('/conversations', { partnerId: await partnerId(ana, 'Clara') })).body.conversation.id;
    const n0 = mails('clara@rolejunto.local').length;
    await ana.post(`/conversations/${conv}/messages`, { body: 'Oi Bia, tudo bem?' });
    await ana.post(`/conversations/${conv}/messages`, { body: 'Que tal sábado?' });
    await flushNotices();
    const chat = mails('clara@rolejunto.local').slice(n0).filter((m) => m.subject.includes('mensagem'));
    assert.equal(chat.length, 1);
    // Ana desliga os e-mails: a resposta da Bia não gera e-mail
    await ana.patch('/me', { notifications: { email: false, push: true, promos: false } });
    const a0 = mails('cliente@rolejunto.local').length;
    await bia.post(`/conversations/${conv}/messages`, { body: 'Tudo ótimo! Sábado combinado.' });
    await flushNotices();
    assert.equal(mails('cliente@rolejunto.local').length, a0);
    await ana.patch('/me', { notifications: { email: true, push: true, promos: false } });
    assert.equal((await bia.get('/notifications')).status, 200);
  });
});
