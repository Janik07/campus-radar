// Starts a local PostgreSQL for development (no installation needed).
// Usage: npm run db:local   (keep it running in a separate terminal)
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.PGDATA_DIR || path.resolve('.pgdata');
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'radar', password: 'radar', port: 54329, persistent: true });
if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try { await pg.createDatabase('radar'); } catch { /* already exists */ }
console.log('Local PostgreSQL running: postgres://radar:radar@localhost:54329/radar  (Ctrl+C to stop)');
const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
