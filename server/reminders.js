// US-08: sends reminders 24 hours and 1 hour before an event.
// Runs every minute inside the server and can also be triggered by an external cron (/api/cron/tick).
import { many, q } from './db.js';
import { notifyUser, telegramEnabled } from './telegram.js';
import { config } from './config.js';
import { formatWhen } from './util.js';

const WINDOWS = [
  // kind, user setting column, upper bound before start, lower bound before start
  { kind: '24h', setting: 'notify_24h', upper: '24 hours', lower: '1 hour' },
  { kind: '1h', setting: 'notify_1h', upper: '1 hour', lower: '0 minutes' },
];

let running = false;

export async function runReminders() {
  if (!telegramEnabled() || running) return { sent: 0, skipped: true };
  running = true;
  let sent = 0;
  try {
    for (const w of WINDOWS) {
      // Events starting within the window for which this reminder has not been sent yet.
      const rows = await many(
        `SELECT e.id AS event_id, e.title, e.starts_at, e.location, c.name AS club_name, u.id AS user_id
         FROM registrations r
         JOIN events e ON e.id = r.event_id AND e.status='published'
         JOIN clubs c ON c.id = e.club_id
         JOIN users u ON u.id = r.user_id AND u.telegram_chat_id IS NOT NULL AND u.${w.setting} = true
         WHERE r.status='going'
           AND e.starts_at > now() + $1::interval
           AND e.starts_at <= now() + $2::interval
           AND NOT EXISTS (SELECT 1 FROM reminders_sent s WHERE s.event_id=e.id AND s.user_id=u.id AND s.kind=$3)
         LIMIT 200`, [w.lower, w.upper, w.kind]);
      for (const r of rows) {
        // Record first so a crash never causes duplicate messages.
        const ins = await q(
          `INSERT INTO reminders_sent (event_id,user_id,kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [r.event_id, r.user_id, w.kind]);
        if (!ins.rowCount) continue;
        const hoursLeft = Math.round((new Date(r.starts_at) - Date.now()) / 3600e3);
        const head = w.kind === '24h' ? `⏰ Coming up in ${hoursLeft} hours` : '🔔 Starting in less than an hour';
        const ok = await notifyUser(r.user_id,
          `${head}: <b>${esc(r.title)}</b>\n${esc(r.club_name)}\n🗓 ${formatWhen(r.starts_at)}\n📍 ${esc(r.location)}` +
          (config.publicUrl ? `\n\n${config.publicUrl}/events/${r.event_id}` : ''));
        if (ok) sent++;
      }
    }
  } finally {
    running = false;
  }
  return { sent };
}

export function startScheduler() {
  setInterval(() => runReminders().catch(e => console.error('[reminders]', e.message)), 60 * 1000);
}

const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
