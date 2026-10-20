// Conexão com o banco. Produção: PostgreSQL (DATABASE_URL). Desenvolvimento/testes: PGlite (Postgres embutido).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export type DB = NodePgDatabase<typeof schema>;
export interface Database { db: DB; close: () => Promise<void> }

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export async function openDatabase(opts: { url?: string; pgliteDir?: string; memory?: boolean }): Promise<Database> {
  if (opts.url) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new Pool({ connectionString: opts.url, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db, close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (!opts.memory && opts.pgliteDir) mkdirSync(opts.pgliteDir, { recursive: true });
  const client = new PGlite(opts.memory ? undefined : opts.pgliteDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as DB, close: () => client.close() };
}

export { schema };
