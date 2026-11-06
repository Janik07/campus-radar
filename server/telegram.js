// US-08: Telegram bot — links accounts and delivers notifications.
import crypto from 'node:crypto';
import { Bot, webhookCallback } from 'grammy';
import { config } from './config.js';
import { q, one, many } from './db.js';
import { formatWhen } from './util.js';

export let bot = null;
let botUsername = config.telegramBotUsername;

export const telegramEnabled = () => !!bot;
export const getBotUsername = () => botUsername;

// Webhook path contains a secret derived from the token, so strangers cannot post fake updates.
export const webhookPath = () =>
  `/api/telegram/${crypto.createHash('sha256').update(config.telegramToken).digest('hex').slice(0, 24)}`;

export async function startBot(app) {
  // TELEGRAM_FAKE=true prints messages to the log instead of sending them (for tests).
  if (!config.telegramToken && process.env.TELEGRAM_FAKE === 'true') {
    bot = { api: { sendMessage: async (chat, text) => console.log(`[telegram:fake] to ${chat}: ${text.replace(/\n/g, ' | ')}`) } };
    botUsername = 'campus_radar_test_bot';
    console.log('[telegram] fake bot enabled (messages go to the log)');
    return;
  }
  if (!config.telegramToken) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return;
  }
  bot = new Bot(config.telegramToken);

  bot.command('start', async ctx => {
    const token = (ctx.match || '').trim();
    if (!token) {
      return ctx.reply(
        'Hi! I am the Campus Radar bot. I remind you about AITU events 24 hours and 1 hour before they start.\n\n' +
        'To connect your account, open Campus Radar → Settings → “Connect Telegram”.' +
        (config.publicUrl ? `\n${config.publicUrl}/settings` : ''));
    }
    const user = await one('SELECT * FROM users WHERE tg_link_token=$1', [token]);
    if (!user) return ctx.reply('This link has expired. Open Settings on the website and press “Connect Telegram” again.');
    // One Telegram account can be linked to one user.
    await q('UPDATE users SET telegram_chat_id=NULL, telegram_username=NULL WHERE telegram_chat_id=$1 AND id<>$2', [ctx.chat.id, user.id]);
    await q('UPDATE users SET telegram_chat_id=$1, telegram_username=$2, tg_link_token=NULL WHERE id=$3',
      [ctx.chat.id, ctx.from?.username || null, user.id]);
    await ctx.reply(`✅ Connected to ${user.email}. You will get reminders for events you register for.\n\nCommands:\n/my — your upcoming events\n/stop — disconnect`);
  });

  bot.command('my', async ctx => {
    const user = await one('SELECT * FROM users WHERE telegram_chat_id=$1', [ctx.chat.id]);
    if (!user) return ctx.reply('Your account is not connected yet. Use “Connect Telegram” in Settings on the website.');
    const rows = await many(
      `SELECT e.id, e.title, e.starts_at, e.location, r.status FROM registrations r JOIN events e ON e.id=r.event_id
       WHERE r.user_id=$1 AND r.status IN ('going','waitlist') AND e.status='published' AND e.starts_at > now()
       ORDER BY e.starts_at LIMIT 10`, [user.id]);
    if (!rows.length) return ctx.reply('You have no upcoming events. Find one on Campus Radar!');
    const lines = rows.map(r => `• <b>${esc(r.title)}</b>${r.status === 'waitlist' ? ' (waitlist)' : ''}\n  🗓 ${formatWhen(r.starts_at)} · 📍 ${esc(r.location)}` +
      (config.publicUrl ? `\n  ${config.publicUrl}/events/${r.id}` : ''));
    return ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  bot.command('stop', async ctx => {
    await q('UPDATE users SET telegram_chat_id=NULL, telegram_username=NULL WHERE telegram_chat_id=$1', [ctx.chat.id]);
    return ctx.reply('Disconnected. You will not receive reminders anymore. You can connect again from Settings.');
  });

  bot.catch(err => console.error('[telegram] handler error', err.message));

  await bot.init();
  botUsername = bot.botInfo.username;
  await bot.api.setMyCommands([
    { command: 'my', description: 'My upcoming events' },
    { command: 'stop', description: 'Disconnect from Campus Radar' },
  ]).catch(() => {});

  if (config.publicUrl.startsWith('https://')) {
    app.post(webhookPath(), webhookCallback(bot, 'express'));
    await bot.api.setWebhook(config.publicUrl + webhookPath(), { drop_pending_updates: true });
    console.log(`[telegram] @${botUsername} running via webhook`);
  } else {
    await bot.api.deleteWebhook().catch(() => {});
    bot.start({ drop_pending_updates: true });
    console.log(`[telegram] @${botUsername} running via long polling`);
  }
}

export async function notifyUser(userId, html) {
  if (!bot) return false;
  const u = await one('SELECT telegram_chat_id FROM users WHERE id=$1', [userId]);
  if (!u?.telegram_chat_id) return false;
  try {
    await bot.api.sendMessage(u.telegram_chat_id, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    return true;
  } catch (e) {
    console.error('[telegram] send failed', e.message);
    // The user blocked the bot: forget the chat so we stop trying.
    if (/blocked|chat not found|deactivated/i.test(e.message)) {
      await q('UPDATE users SET telegram_chat_id=NULL WHERE id=$1', [userId]);
    }
    return false;
  }
}

export function newLinkToken() {
  return crypto.randomBytes(12).toString('base64url');
}

const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
