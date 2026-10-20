import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { buildApp } from './app.js';

const database = await openDatabase({ url: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
const app = await buildApp(database);

const shutdown = async () => {
  app.log.info('encerrando…');
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`RolêJunto API em ${config.PUBLIC_URL} (banco: ${config.DATABASE_URL ? 'PostgreSQL' : 'PGlite local'}, pagamentos: ${config.PAYMENT_PROVIDER})`);
