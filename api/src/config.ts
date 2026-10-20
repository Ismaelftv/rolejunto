// Configuração por variáveis de ambiente (veja .env.example).
import { z } from 'zod';

import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Lê o arquivo .env da pasta da API, se existir (no Docker, as variáveis vêm do docker-compose).
// No computador, também aproveita as configurações de e-mail do .env da pasta principal.
if (process.env.NODE_ENV !== 'test') {
  try { if (existsSync('.env')) process.loadEnvFile('.env'); } catch { /* .env inválido */ }
  try {
    if (existsSync('../.env') && existsSync('../docker-compose.yml')) {
      const root = parseEnv(readFileSync('../.env', 'utf8'));
      for (const [k, v] of Object.entries(root)) {
        if (/^(GMAIL_|EMAIL_|SMTP_|RESEND_|BREVO_)/.test(k) && v && !process.env[k]) process.env[k] = v;
      }
    }
  } catch { /* ignora */ }
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),
  // Sem DATABASE_URL, usa um PostgreSQL embutido (PGlite) em ./data — ótimo para desenvolvimento.
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('./data/pglite'),
  // Endereço do front-end (CORS e links nos e-mails). Vários separados por vírgula.
  APP_URL: z.string().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(16).default('troque-este-segredo-em-producao'),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_DAYS: z.coerce.number().default(30),
  SERVICE_FEE_RATE: z.coerce.number().default(0.1),
  MIN_AGE: z.coerce.number().default(18),
  LATE_CANCEL_REFUND_RATE: z.coerce.number().default(0.5), // reembolso em cancelamentos com menos de 24 h
  PAYMENT_PROVIDER: z.enum(['mock', 'mercadopago']).default('mock'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  VERIFICATION_PROVIDER: z.enum(['mock']).default('mock'),
  // E-mail pelo Gmail: endereço completo + senha de app de 16 letras (Conta Google → Segurança → Senhas de app)
  GMAIL_USER: z.string().transform((s) => s.trim().replace(/^["']|["']$/g, '').toLowerCase()).optional(),
  GMAIL_APP_PASSWORD: z.string().transform((s) => s.replace(/^["']|["']$/g, '').replace(/\s+/g, '')).optional(),
  EMAIL_FROM: z.string().optional(), // ex.: RolêJunto <seuemail@gmail.com>. Com Gmail, o padrão é "RolêJunto <GMAIL_USER>"
  SMTP_URL: z.string().optional(), // outro provedor: smtps://usuario:senha@smtp.seuprovedor.com:465
  // Alternativas que enviam por HTTPS (funcionam mesmo quando a VPS bloqueia as portas de e-mail 465/587)
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  PUBLIC_URL: z.string().default('http://localhost:3333'),
  ADMIN_EMAIL: z.string().optional(), // e-mail que vira admin no seed
});

// Variáveis vazias no .env contam como "não definidas"
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = Env.safeParse(env);
if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';

if (isProd && config.COOKIE_SECRET === 'troque-este-segredo-em-producao') {
  console.error('Defina COOKIE_SECRET em produção.');
  process.exit(1);
}
