// Aplica as migrações (o servidor também aplica automaticamente ao iniciar).
import { config } from '../config.js';
import { openDatabase } from './index.js';

const database = await openDatabase({ url: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
await database.close();
console.log('Migrações aplicadas.');
