import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { authRouter, loadUser } from './auth.js';
import { api } from './routes.js';
import { startBot } from './telegram.js';
import { startScheduler, runReminders } from './reminders.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// Telegram webhook must be registered before the JSON API routes and the SPA fallback.
await migrate({ seedDemo: process.env.SEED_DEMO !== 'false' });
await startBot(app).catch(e => console.error('[telegram] failed to start:', e.message));

app.use(loadUser);
app.use('/api/auth', authRouter);
app.use('/api', api);

// Serve the built React app.
const webDist = path.join(dir, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`Campus Radar listening on :${config.port}`);
  startScheduler();
  runReminders().catch(() => {});
});
