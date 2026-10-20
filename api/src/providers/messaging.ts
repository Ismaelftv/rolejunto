// E-mail e SMS.
// E-mail, em ordem de prioridade: Resend ou Brevo (por HTTPS), Gmail (GMAIL_USER + GMAIL_APP_PASSWORD),
// outro SMTP (SMTP_URL) ou, sem nada configurado, só no console/log.
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

export interface MailContent { subject: string; text: string; html?: string }
export type MailMode = 'resend' | 'brevo' | 'gmail' | 'smtp' | 'console';
export interface Mailer {
  /** Envia o e-mail. Nunca derruba a requisição: em caso de falha, registra no log e devolve false. */
  send(to: string, mail: MailContent): Promise<boolean>;
  /** Confere a conexão/login com o provedor agora. */
  check(): Promise<MailStatus>;
  mode: MailMode;
}
export interface Sms { send(phone: string, text: string): Promise<void> }
type Log = { info: (o: object, m: string) => void; warn?: (o: object, m: string) => void; error?: (o: object, m: string) => void };

/** Motivo do problema, em forma de código (o painel traduz e explica como resolver). */
export type MailProblem = 'not_configured' | 'bad_user' | 'auth' | 'two_step' | 'blocked_port' | 'tls' | 'rejected' | 'unknown';
export interface MailStatus {
  mode: MailMode;
  from: string | null;
  ok: boolean | null; // null = ainda não conferido
  problem: MailProblem | null;
  detail: string | null; // mensagem técnica original
  checkedAt: string | null;
  lastSentAt: string | null;
  lastError: { at: string; to: string; problem: MailProblem; detail: string } | null;
}

export const sentMail: ({ to: string } & MailContent)[] = []; // usado nos testes e no modo console
export const mailStatus: MailStatus = { mode: 'console', from: null, ok: null, problem: null, detail: null, checkedAt: null, lastSentAt: null, lastError: null };

/** Traduz o erro técnico em um motivo conhecido. */
export function explainMailError(err: unknown): MailProblem {
  const e = err as { code?: string; responseCode?: number; message?: string; command?: string };
  const msg = `${e?.code ?? ''} ${e?.responseCode ?? ''} ${e?.message ?? err}`;
  if (/534|5\.7\.9|Application-specific password required/i.test(msg)) return 'two_step';
  if (/535|5\.7\.8|Username and Password not accepted|Invalid login|EAUTH|BadCredentials|401|403.*key|invalid api key|unauthorized/i.test(msg)) return 'auth';
  if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ECONNRESET|ESOCKET|Greeting never received|Connection timeout|ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'blocked_port';
  if (/TLS|SSL|certificate|self.signed/i.test(msg)) return 'tls';
  if (/^5\d\d|550|553|554|rejected|not allowed|sender/i.test(`${e?.responseCode ?? ''} ${e?.message ?? ''}`)) return 'rejected';
  return 'unknown';
}

const DEFAULT_FROM = 'RolêJunto <nao-responda@rolejunto.com>';
const parseFrom = (from: string) => { const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/); return m ? { name: m[1].trim() || 'RolêJunto', email: m[2].trim() } : { name: 'RolêJunto', email: from.trim() }; };

interface Driver { mode: MailMode; from: string; send(to: string, m: MailContent): Promise<void>; check(): Promise<void> }

function httpDriver(mode: 'resend' | 'brevo'): Driver {
  const from = config.EMAIL_FROM ?? DEFAULT_FROM;
  const call = async (url: string, init: RequestInit) => {
    const res = await fetch(url, init);
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 400)), { responseCode: res.status });
  };
  if (mode === 'resend') {
    const headers = { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
    return {
      mode, from,
      send: (to, m) => call('https://api.resend.com/emails', { method: 'POST', headers, body: JSON.stringify({ from, to: [to], subject: m.subject, text: m.text, html: m.html }) }),
      check: async () => { /* chaves só de envio não podem consultar a conta: a confirmação vem no primeiro envio */ },
    };
  }
  const headers = { 'api-key': config.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' };
  const sender = parseFrom(from);
  return {
    mode, from,
    send: (to, m) => call('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers, body: JSON.stringify({ sender, to: [{ email: to }], subject: m.subject, textContent: m.text, htmlContent: m.html ?? `<pre>${m.text}</pre>` }) }),
    check: () => call('https://api.brevo.com/v3/account', { headers }),
  };
}

function smtpDriver(): Driver | null {
  let t: Transporter; let mode: MailMode; let from: string;
  if (config.GMAIL_USER && config.GMAIL_APP_PASSWORD) {
    // smtp.gmail.com, porta 465 com SSL. O remetente precisa ser o próprio Gmail (ou um alias configurado nele).
    t = nodemailer.createTransport({ service: 'gmail', auth: { user: config.GMAIL_USER, pass: config.GMAIL_APP_PASSWORD }, connectionTimeout: 15000, greetingTimeout: 15000 });
    mode = 'gmail';
    from = config.EMAIL_FROM && parseFrom(config.EMAIL_FROM).email.toLowerCase() === config.GMAIL_USER ? config.EMAIL_FROM : `RolêJunto <${config.GMAIL_USER}>`;
  } else if (config.SMTP_URL) {
    t = nodemailer.createTransport(config.SMTP_URL); mode = 'smtp'; from = config.EMAIL_FROM ?? DEFAULT_FROM;
  } else return null;
  return {
    mode, from,
    send: async (to, m) => { await t.sendMail({ from, to, subject: m.subject, text: m.text, html: m.html }); },
    check: async () => { await t.verify(); },
  };
}

function pickDriver(): Driver | null {
  if (config.NODE_ENV === 'test') return null;
  if (config.RESEND_API_KEY) return httpDriver('resend');
  if (config.BREVO_API_KEY) return httpDriver('brevo');
  return smtpDriver();
}

export function createMailer(log: Log): Mailer {
  const drv = pickDriver();
  const now = () => new Date().toISOString();
  const err = (o: object, m: string) => (log.error ? log.error(o, m) : log.info(o, m)); // chama pelo próprio logger (pino precisa do "this")

  if (!drv) {
    Object.assign(mailStatus, { mode: 'console', from: null, ok: false, problem: 'not_configured', detail: null, checkedAt: now() });
    if (config.NODE_ENV === 'production') err({}, 'E-MAIL NÃO CONFIGURADO: os e-mails só aparecem neste log. Preencha GMAIL_USER e GMAIL_APP_PASSWORD no .env e rode "docker compose up -d".');
    return {
      mode: 'console',
      async send(to, mail) {
        sentMail.push({ to, ...mail });
        if (sentMail.length > 200) sentMail.shift();
        if (config.NODE_ENV !== 'test') log.info({ to, subject: mail.subject, text: mail.text }, 'e-mail (modo console: configure o Gmail para enviar de verdade)');
        return true;
      },
      async check() { return { ...mailStatus }; },
    };
  }

  Object.assign(mailStatus, { mode: drv.mode, from: drv.from });
  const check = async (): Promise<MailStatus> => {
    if (drv.mode === 'gmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.GMAIL_USER ?? '')) {
      Object.assign(mailStatus, { ok: false, problem: 'bad_user', detail: `GMAIL_USER="${config.GMAIL_USER}"`, checkedAt: now() });
      return { ...mailStatus };
    }
    try {
      await drv.check();
      Object.assign(mailStatus, { ok: true, problem: null, detail: null, checkedAt: now() });
      log.info({ mode: drv.mode, from: drv.from }, 'e-mail pronto para envio');
    } catch (e) {
      Object.assign(mailStatus, { ok: false, problem: explainMailError(e), detail: String((e as Error).message ?? e).slice(0, 400), checkedAt: now() });
      err({ mode: drv.mode, problem: mailStatus.problem, err: mailStatus.detail }, 'e-mail: falha ao conectar. Rode o diagnóstico: docker compose exec api node dist/doctor.js');
    }
    return { ...mailStatus };
  };
  void check().catch(() => {}); // confere no início, para o erro aparecer logo no log (nunca derruba a API)

  return {
    mode: drv.mode,
    check,
    async send(to, mail) {
      try {
        await drv.send(to, mail);
        Object.assign(mailStatus, { lastSentAt: now(), ok: true, problem: null });
        return true;
      } catch (e) {
        const problem = explainMailError(e);
        const detail = String((e as Error).message ?? e).slice(0, 400);
        Object.assign(mailStatus, { ok: false, problem, detail, lastError: { at: now(), to, problem, detail } });
        err({ to, subject: mail.subject, problem, err: detail }, 'e-mail não enviado');
        // Falha passageira (rede, servidor ocupado): tenta de novo em segundo plano, 3 vezes (1, 5 e 30 min).
        // Senha errada ou remetente recusado não adianta repetir.
        if (RETRYABLE.has(problem)) scheduleRetry(drv, to, mail, 1, log, err);
        return false;
      }
    },
  };
}

const RETRYABLE = new Set(['blocked_port', 'tls', 'unknown']);
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

function scheduleRetry(drv: Driver, to: string, mail: MailContent, n: number, log: Log, err: (o: object, m: string) => void) {
  if (config.NODE_ENV === 'test') return;
  const t = setTimeout(async () => {
    try {
      await drv.send(to, mail);
      Object.assign(mailStatus, { lastSentAt: new Date().toISOString(), ok: true, problem: null });
      log.info({ to, subject: mail.subject, tentativa: n + 1 }, 'e-mail enviado na nova tentativa');
    } catch (e) {
      const problem = explainMailError(e);
      if (n < RETRY_DELAYS_MS.length && RETRYABLE.has(problem)) scheduleRetry(drv, to, mail, n + 1, log, err);
      else err({ to, subject: mail.subject, problem, tentativas: n + 1 }, 'e-mail desistiu depois de várias tentativas');
    }
  }, RETRY_DELAYS_MS[n - 1]);
  t.unref();
}

// Para SMS/WhatsApp ao contato de confiança, ligue aqui um provedor (Twilio, Zenvia, etc.).
export function createSms(log: Log): Sms {
  return { send: async (phone, text) => { if (config.NODE_ENV !== 'test') log.info({ phone, text }, 'SMS (modo console)'); } };
}
