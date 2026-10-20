// Diagnóstico do RolêJunto: confere banco, e-mail, pagamentos e configurações, e diz como corrigir.
// No servidor:   docker compose exec api node dist/doctor.js [email-para-teste]
// No computador: npm run doctor -- [email-para-teste]
import { accessSync, constants, mkdirSync } from 'node:fs';
import net from 'node:net';
import { sql } from 'drizzle-orm';
import { config, isProd } from './config.js';
import { openDatabase } from './db/index.js';
import { users } from './db/schema.js';
import { renderEmail } from './lib/emails.js';
import { createMailer, type MailProblem } from './providers/messaging.js';

const to = process.argv[2];
let failures = 0;
const ok = (m: string) => console.log(`  ✅ ${m}`);
const warn = (m: string) => console.log(`  ⚠️  ${m}`);
const bad = (m: string, fix?: string) => { failures++; console.log(`  ❌ ${m}`); if (fix) console.log(`     → ${fix.split('\n').join('\n       ')}`); };
const title = (t: string) => console.log(`\n${t}`);

export const FIX: Record<MailProblem, string> = {
  not_configured: 'Nenhum envio de e-mail configurado. No arquivo .env, preencha:\n  GMAIL_USER=contatorolejunto@gmail.com\n  GMAIL_APP_PASSWORD=abcd efgh ijkl mnop\nDepois aplique com: docker compose up -d   (só "restart" NÃO lê o .env de novo)',
  bad_user: 'GMAIL_USER precisa ser só o endereço, por exemplo: GMAIL_USER=contatorolejunto@gmail.com',
  auth: 'O Gmail recusou o login (erro 535). Use a SENHA DE APP de 16 letras, não a senha normal do Gmail.\nCrie uma nova em https://myaccount.google.com/apppasswords e confira se GMAIL_USER é a mesma conta.',
  two_step: 'Esta conta precisa de senha de app (erro 534). Ative a verificação em duas etapas e crie a senha em https://myaccount.google.com/apppasswords',
  blocked_port: 'O servidor não consegue se conectar ao Gmail: a VPS está bloqueando as portas de e-mail (465/587).\nPeça a liberação ao suporte da VPS, ou use o Brevo (grátis, envia por HTTPS): crie a conta em brevo.com,\ngere uma chave de API e coloque BREVO_API_KEY=... e EMAIL_FROM=RolêJunto <contatorolejunto@gmail.com> no .env.',
  tls: 'Falha de segurança (TLS) na conexão. Confira a data/hora do servidor e se há proxy ou antivírus interceptando.',
  rejected: 'O provedor recusou o envio. Com Gmail, o remetente (EMAIL_FROM) precisa ser o próprio GMAIL_USER. No Brevo/Resend, valide o remetente no painel deles.',
  unknown: 'Erro inesperado. Veja a mensagem técnica acima e confira as configurações de e-mail no .env.',
};

function tcp(host: string, port: number, ms = 6000) {
  return new Promise<boolean>((resolve) => {
    const s = net.connect({ host, port });
    const done = (r: boolean) => { s.destroy(); resolve(r); };
    s.setTimeout(ms, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

console.log('RolêJunto · diagnóstico do sistema');
console.log(`Modo: ${config.NODE_ENV}${isProd ? ' (produção)' : ' (desenvolvimento)'}`);

// ---------- Configuração ----------
title('1. Configuração');
if (isProd) {
  if (config.APP_URL.startsWith('https://')) ok(`Endereço do site: ${config.APP_URL}`);
  else bad(`Endereço do site sem HTTPS: ${config.APP_URL}`, 'Defina DOMAIN no .env (sem https://) e rode docker compose up -d');
  ok('COOKIE_SECRET definido');
} else ok(`Endereço do site: ${config.APP_URL}`);

// ---------- Banco ----------
title('2. Banco de dados');
try {
  const database = await openDatabase({ url: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
  const [{ n }] = await database.db.select({ n: sql<number>`count(*)::int` }).from(users);
  const [{ a }] = await database.db.select({ a: sql<number>`count(*)::int` }).from(users).where(sql`${users.role} = 'admin'`);
  ok(`Conectado (${config.DATABASE_URL ? 'PostgreSQL' : 'banco embutido de desenvolvimento'}) · ${n} contas`);
  if (a > 0) ok(`${a} administrador(es)`);
  else bad('Nenhum administrador', 'Crie um: docker compose exec api node dist/db/createAdmin.js voce@email.com "Seu Nome" "senha-forte"');
  await database.close();
} catch (e) {
  bad(`Não conectou ao banco: ${(e as Error).message}`, 'Confira se o serviço "db" está rodando (docker compose ps) e a DB_PASSWORD do .env.');
}

// ---------- Fotos ----------
title('3. Armazenamento de fotos');
try { mkdirSync(config.UPLOAD_DIR, { recursive: true }); accessSync(config.UPLOAD_DIR, constants.W_OK); ok(`Pasta de fotos com permissão de escrita (${config.UPLOAD_DIR})`); }
catch { bad(`Sem permissão de escrita em ${config.UPLOAD_DIR}`); }

// ---------- E-mail ----------
title('4. E-mail');
const silent = { info: () => {}, error: () => {} };
const mailer = createMailer(silent);
if (mailer.mode === 'console') {
  bad('E-mail NÃO configurado: os códigos só aparecem no log da API.', FIX.not_configured);
} else {
  ok(`Envio por: ${{ gmail: `Gmail (${config.GMAIL_USER})`, smtp: 'SMTP', resend: 'Resend (HTTPS)', brevo: 'Brevo (HTTPS)', console: '' }[mailer.mode]}`);
  let reachable = true;
  if (mailer.mode === 'gmail') {
    const len = config.GMAIL_APP_PASSWORD?.length ?? 0;
    if (len === 16) ok('Senha de app com 16 letras');
    else warn(`A senha de app costuma ter 16 letras (a sua tem ${len}). Confira se não é a senha normal do Gmail.`);
    const [p465, p587] = await Promise.all([tcp('smtp.gmail.com', 465), tcp('smtp.gmail.com', 587)]);
    if (p465) ok('Conexão com smtp.gmail.com:465 liberada');
    else bad(`Sem conexão com smtp.gmail.com:465${p587 ? ' (a 587 funciona)' : ' nem 587'}`, FIX.blocked_port);
    reachable = p465;
  }
  const st = reachable ? await mailer.check() : null;
  if (!st) warn('Não deu para testar o login: primeiro libere a conexão com o Gmail (acima).');
  else if (st.ok) ok('Login no provedor de e-mail aceito');
  else if (st.problem) { bad(`Login recusado/falhou${st.detail ? `: ${st.detail}` : ''}`, FIX[st.problem]); }
  if (to && st?.ok) {
    const sent = await mailer.send(to, renderEmail('verify_email', 'pt', { name: 'teste', code: '123456' }));
    if (sent) ok(`E-mail de teste enviado para ${to}. Confira a caixa de entrada, Spam e Promoções.`);
    else bad(`E-mail de teste para ${to} não foi enviado.`, FIX[(await mailer.check()).problem ?? 'unknown']);
  } else if (st?.ok) console.log('     (para enviar um e-mail de teste, repita o comando com o seu e-mail no final)');
}

// ---------- Pagamentos e verificação ----------
title('5. Pagamentos');
if (config.PAYMENT_PROVIDER === 'sharkpay') {
  if (config.SHARKPAY_PUBLIC_KEY && config.SHARKPAY_SECRET_KEY) ok('SharkPay: chaves configuradas'); else bad('SharkPay sem SHARKPAY_PUBLIC_KEY / SHARKPAY_SECRET_KEY');
  if (config.SHARKPAY_PAYER_DOCUMENT) ok('SharkPay: documento do pagador configurado'); else bad('SharkPay sem SHARKPAY_PAYER_DOCUMENT (CPF/CNPJ usado nas cobranças)');
  if (config.SHARKPAY_WEBHOOK_SECRET) ok('SharkPay: segredo do webhook configurado'); else warn('Defina SHARKPAY_WEBHOOK_SECRET para confirmar pagamentos automaticamente.');
}
if (config.PAYMENT_PROVIDER === 'mock') (isProd ? warn : ok)('Modo de TESTE: pagamentos simulados, sem cobrança real (PAYMENT_PROVIDER=mock).');
else {
  if (config.MERCADOPAGO_ACCESS_TOKEN) ok('Mercado Pago: token configurado'); else bad('Mercado Pago sem MERCADOPAGO_ACCESS_TOKEN');
  if (config.MERCADOPAGO_WEBHOOK_SECRET) ok('Mercado Pago: segredo do webhook configurado'); else warn('Defina MERCADOPAGO_WEBHOOK_SECRET para confirmar pagamentos automaticamente.');
}
title('6. Verificação de identidade');
if (isProd) ok('Manual: aprove os documentos em Painel admin → Verificações.'); else ok('Desenvolvimento: aprovação automática.');

console.log(failures ? `\nResultado: ${failures} problema(s) para corrigir.` : '\nResultado: tudo certo! ✅');
process.exit(failures ? 1 : 0);
