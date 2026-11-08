// Creates tables and fills an empty database with the AITU clubs and demo events.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, one, pool } from './db.js';
import { seedDemo as seedDemoData } from './demo.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function migrate({ seedDemo = true } = {}) {
  await q(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));

  const { n } = await one('SELECT count(*)::int AS n FROM clubs');
  if (n === 0) {
    const clubs = JSON.parse(fs.readFileSync(path.join(dir, 'seed', 'clubs.json'), 'utf8'));
    for (const c of clubs) {
      await q(
        `INSERT INTO clubs (slug,name,category,status,president,president_tg,telegram_url,description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (slug) DO NOTHING`,
        [c.slug, c.name, c.category, c.status, c.president, c.president_tg, c.telegram_url, c.description || '']
      );
    }
    console.log(`[migrate] imported ${clubs.length} clubs`);
  }

  if (seedDemo) await seedDemoData();
}

// Allow `node server/migrate.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}
