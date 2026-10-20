// Cria (ou promove) um administrador. Uso: node dist/db/createAdmin.js email@dominio.com "Nome" "senha-forte"
import { eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { hashPassword } from '../lib/security.js';
import { openDatabase } from './index.js';
import { users } from './schema.js';

const [email, name = 'Administrador', password] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  console.error('Uso: createAdmin <email> <nome> <senha com 12+ caracteres>');
  process.exit(1);
}
const database = await openDatabase({ url: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
const [found] = await database.db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
if (found) {
  await database.db.update(users).set({ role: 'admin', verification: 'verified', emailVerifiedAt: new Date(), passwordHash: await hashPassword(password) }).where(eq(users.id, found.id));
  console.log(`Usuário ${email} agora é administrador.`);
} else {
  const now = new Date();
  await database.db.insert(users).values({ email: email.toLowerCase(), name, passwordHash: await hashPassword(password), role: 'admin', verification: 'verified', emailVerifiedAt: new Date(), birthDate: '1990-01-01', termsAcceptedAt: now, privacyConsentAt: now });
  console.log(`Administrador ${email} criado.`);
}
await database.close();
