// Envia um e-mail de teste para conferir a configuração do Gmail.
// Uso: node dist/testEmail.js seuemail@exemplo.com   (ou: npm run email:test -- seuemail@exemplo.com)
import { config } from './config.js';
import { renderEmail } from './lib/emails.js';
import { createMailer } from './providers/messaging.js';

const to = process.argv[2];
if (!to) { console.error('Uso: node dist/testEmail.js destino@exemplo.com'); process.exit(1); }
const log = { info: (o: object, m: string) => console.log(m, o), error: (o: object, m: string) => console.error(m, o) };
const mailer = createMailer(log);
if (mailer.mode === 'console') {
  console.error('Nenhum envio configurado. Preencha GMAIL_USER e GMAIL_APP_PASSWORD no .env.');
  process.exit(1);
}
const ok = await mailer.send(to, renderEmail('verify_email', 'pt', { name: 'teste', code: '123456' }));
console.log(ok ? `E-mail de teste enviado para ${to} (via ${mailer.mode === 'gmail' ? `Gmail, conta ${config.GMAIL_USER}` : 'SMTP'}). Confira a caixa de entrada e o spam.` : 'Falhou. Veja a mensagem de erro acima.');
process.exit(ok ? 0 : 1);
