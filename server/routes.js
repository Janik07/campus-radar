import { Router } from 'express';
import { z } from 'zod';
import { q, one, many, tx } from './db.js';
import { config } from './config.js';
import { requireUser, requireAdmin, managedClubIds, publicUser } from './auth.js';
import { register, cancel, fillFreeSeats, announcePromotions, httpError } from './registrations.js';
import { notifyUser, newLinkToken, telegramEnabled, getBotUsername } from './telegram.js';
import { runReminders } from './reminders.js';
import { CATEGORIES, toIcs, csvEscape, formatWhen } from './util.js';

export const api = Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// Common SELECT for event cards: counts and the current user's status.
const EVENT_SELECT = `
  SELECT e.*, c.name AS club_name, c.slug AS club_slug, c.telegram_url AS club_telegram,
    (SELECT count(*)::int FROM registrations r WHERE r.event_id=e.id AND r.status='going') AS going_count,
    (SELECT count(*)::int FROM registrations r WHERE r.event_id=e.id AND r.status='waitlist') AS waitlist_count,
    (SELECT r.status FROM registrations r WHERE r.event_id=e.id AND r.user_id=$1) AS my_status
  FROM events e JOIN clubs c ON c.id = e.club_id`;

const shapeEvent = e => ({
  id: e.id, title: e.title, description: e.description, category: e.category, location: e.location,
  startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, status: e.status,
  club: { id: e.club_id, name: e.club_name, slug: e.club_slug, telegramUrl: e.club_telegram },
  goingCount: e.going_count, waitlistCount: e.waitlist_count,
  myStatus: e.my_status === 'cancelled' ? null : e.my_status,
  spotsLeft: e.capacity == null ? null : Math.max(0, e.capacity - e.going_count),
});

api.get('/meta', (_req, res) => res.json({
  categories: CATEGORIES,
  emailDomain: config.emailDomain,
  demoMode: config.demoMode && !config.resendApiKey,
  telegram: { enabled: telegramEnabled(), username: getBotUsername() },
}));

// ---------- US-01 / US-02: feed with filters ----------
api.get('/events', wrap(async (req, res) => {
  const { category, when, q: search, club } = req.query;
  const params = [req.user?.id ?? null];
  const where = [`e.status='published'`, `coalesce(e.ends_at, e.starts_at + interval '2 hours') > now()`];
  if (category && CATEGORIES.includes(category)) { params.push(category); where.push(`e.category=$${params.length}`); }
  if (club) { params.push(club); where.push(`c.slug=$${params.length}`); }
  if (search) { params.push(`%${String(search).slice(0, 80)}%`); where.push(`(e.title ILIKE $${params.length} OR e.description ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
  // Date ranges are computed in Astana time.
  const tz = config.timezone;
  params.push(tz);
  const tzp = `$${params.length}`;
  if (when === 'today') where.push(`(e.starts_at AT TIME ZONE ${tzp})::date = (now() AT TIME ZONE ${tzp})::date`);
  if (when === 'tomorrow') where.push(`(e.starts_at AT TIME ZONE ${tzp})::date = (now() AT TIME ZONE ${tzp})::date + 1`);
  if (when === 'week') where.push(`e.starts_at < now() + interval '7 days'`);
  if (when === 'weekend') where.push(`extract(isodow from e.starts_at AT TIME ZONE ${tzp}) IN (6,7) AND e.starts_at < now() + interval '7 days'`);
  if (when === 'month') where.push(`e.starts_at < now() + interval '30 days'`);
  if (!['today', 'tomorrow', 'weekend'].includes(when)) params.pop(); // tz param unused
  const rows = await many(`${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.starts_at LIMIT 200`, params);
  res.json({ events: rows.map(shapeEvent) });
}));

// ---------- US-03: event page ----------
api.get('/events/:id', wrap(async (req, res) => {
  const e = await one(`${EVENT_SELECT} WHERE e.id=$2`, [req.user?.id ?? null, Number(req.params.id) || 0]);
  if (!e) return res.status(404).json({ error: 'Event not found.' });
  const out = shapeEvent(e);
  if (out.myStatus === 'waitlist') {
    const p = await one(
      `SELECT count(*)::int AS pos FROM registrations w, registrations me
       WHERE me.event_id=$1 AND me.user_id=$2 AND w.event_id=$1 AND w.status='waitlist' AND (w.updated_at, w.id) <= (me.updated_at, me.id)`,
      [e.id, req.user.id]);
    out.waitlistPosition = p.pos;
  }
  const ids = await managedClubIds(req.user);
  out.canManage = ids.includes(e.club_id);
  res.json({ event: out });
}));

// ---------- US-09: calendar file ----------
api.get('/events/:id/ics', wrap(async (req, res) => {
  const e = await one(`SELECT * FROM events WHERE id=$1`, [Number(req.params.id) || 0]);
  if (!e) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${e.id}.ics"`);
  res.send(toIcs(e, config.publicUrl ? `${config.publicUrl}/events/${e.id}` : ''));
}));

// ---------- US-06 / US-07: register / cancel ----------
api.post('/events/:id/register', requireUser, wrap(async (req, res) => {
  res.json(await register(Number(req.params.id), req.user.id));
}));
api.delete('/events/:id/register', requireUser, wrap(async (req, res) => {
  res.json(await cancel(Number(req.params.id), req.user.id));
}));

// ---------- My events and settings ----------
api.get('/me/events', requireUser, wrap(async (req, res) => {
  const rows = await many(`${EVENT_SELECT}
    JOIN registrations mr ON mr.event_id=e.id AND mr.user_id=$1 AND mr.status IN ('going','waitlist')
    ORDER BY e.starts_at`, [req.user.id]);
  const now = Date.now();
  const all = rows.map(shapeEvent);
  res.json({
    upcoming: all.filter(e => new Date(e.endsAt || e.startsAt) > now),
    past: all.filter(e => new Date(e.endsAt || e.startsAt) <= now).reverse(),
  });
}));

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  notify24h: z.boolean().optional(),
  notify1h: z.boolean().optional(),
});
api.patch('/me/settings', requireUser, wrap(async (req, res) => {
  const p = settingsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Check the settings and try again.' });
  const s = p.data;
  const u = await one(
    `UPDATE users SET name=coalesce($2,name), notify_24h=coalesce($3,notify_24h), notify_1h=coalesce($4,notify_1h)
     WHERE id=$1 RETURNING *`, [req.user.id, s.name ?? null, s.notify24h ?? null, s.notify1h ?? null]);
  res.json({ user: publicUser(u) });
}));

api.post('/me/telegram-link', requireUser, wrap(async (req, res) => {
  if (!telegramEnabled()) return res.status(503).json({ error: 'The Telegram bot is not configured on this server.' });
  const token = newLinkToken();
  await q('UPDATE users SET tg_link_token=$2 WHERE id=$1', [req.user.id, token]);
  res.json({ url: `https://t.me/${getBotUsername()}?start=${token}` });
}));
api.delete('/me/telegram', requireUser, wrap(async (req, res) => {
  await q('UPDATE users SET telegram_chat_id=NULL, telegram_username=NULL WHERE id=$1', [req.user.id]);
  res.json({ ok: true });
}));
api.post('/me/telegram-test', requireUser, wrap(async (req, res) => {
  const ok = await notifyUser(req.user.id, '👋 Test message from Campus Radar. Reminders will arrive here.');
  res.json({ ok });
}));

// ---------- US-11: clubs catalogue ----------
api.get('/clubs', wrap(async (_req, res) => {
  const rows = await many(`
    SELECT c.id, c.slug, c.name, c.category, c.status, c.description, c.telegram_url,
      (SELECT count(*)::int FROM events e WHERE e.club_id=c.id AND e.status='published' AND e.starts_at > now()) AS upcoming
    FROM clubs c WHERE c.status IN ('active','probation') ORDER BY c.name`);
  res.json({ clubs: rows.map(c => ({ ...c, telegramUrl: c.telegram_url, telegram_url: undefined })) });
}));
api.get('/clubs/:slug', wrap(async (req, res) => {
  const c = await one(`SELECT id, slug, name, category, status, description, telegram_url FROM clubs WHERE slug=$1`, [req.params.slug]);
  if (!c) return res.status(404).json({ error: 'Club not found.' });
  const events = await many(`${EVENT_SELECT} WHERE e.club_id=$2 AND e.status='published' AND e.starts_at > now() ORDER BY e.starts_at`,
    [req.user?.id ?? null, c.id]);
  res.json({ club: { ...c, telegramUrl: c.telegram_url, telegram_url: undefined }, events: events.map(shapeEvent) });
}));

// ---------- US-04 / US-07 / US-10: organiser panel ----------
const eventSchema = z.object({
  clubId: z.number().int(),
  title: z.string().trim().min(3, 'Title is too short.').max(120),
  description: z.string().trim().max(4000).default(''),
  category: z.enum(CATEGORIES),
  location: z.string().trim().min(2, 'Add a location.').max(120),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
});

async function assertManages(user, clubId) {
  const ids = await managedClubIds(user);
  if (!ids.includes(clubId)) throw httpError(403, 'You are not an organiser of this club.');
}

api.get('/organizer/events', requireUser, wrap(async (req, res) => {
  const ids = await managedClubIds(req.user);
  if (!ids.length) return res.json({ events: [] });
  const rows = await many(`${EVENT_SELECT} WHERE e.club_id = ANY($2::int[]) ORDER BY e.starts_at DESC LIMIT 300`, [req.user.id, ids]);
  res.json({ events: rows.map(shapeEvent) });
}));

api.post('/organizer/events', requireUser, wrap(async (req, res) => {
  const p = eventSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Check the form.' });
  const d = p.data;
  await assertManages(req.user, d.clubId);
  if (new Date(d.startsAt) < new Date(Date.now() - 60e3)) return res.status(400).json({ error: 'The start time is in the past.' });
  if (d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) return res.status(400).json({ error: 'The end time must be after the start.' });
  const e = await one(
    `INSERT INTO events (club_id,title,description,category,location,starts_at,ends_at,capacity,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [d.clubId, d.title, d.description, d.category, d.location, d.startsAt, d.endsAt ?? null, d.capacity ?? null, req.user.id]);
  res.status(201).json({ id: e.id });
}));

api.put('/organizer/events/:id', requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const p = eventSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Check the form.' });
  const d = p.data;
  const current = await one('SELECT * FROM events WHERE id=$1', [id]);
  if (!current) return res.status(404).json({ error: 'Event not found.' });
  await assertManages(req.user, current.club_id);
  await assertManages(req.user, d.clubId);
  if (d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) return res.status(400).json({ error: 'The end time must be after the start.' });
  const promoted = await tx(async c => {
    const going = await c.one(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status='going'`, [id]);
    if (d.capacity != null && d.capacity < going.n) {
      throw httpError(400, `${going.n} people are already registered. The limit cannot be lower than that.`);
    }
    const ev = await c.one(
      `UPDATE events SET club_id=$2,title=$3,description=$4,category=$5,location=$6,starts_at=$7,ends_at=$8,capacity=$9,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, d.clubId, d.title, d.description, d.category, d.location, d.startsAt, d.endsAt ?? null, d.capacity ?? null]);
    // If the start time moved, reminders should be sent again for the new time.
    if (new Date(current.starts_at).getTime() !== new Date(ev.starts_at).getTime()) {
      await c.q('DELETE FROM reminders_sent WHERE event_id=$1', [id]);
    }
    return fillFreeSeats(c, ev); // a higher limit lets the waitlist in
  });
  await announcePromotions(id, promoted);
  res.json({ ok: true, promoted: promoted.length });
}));

api.post('/organizer/events/:id/cancel', requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const ev = await one(`SELECT e.*, c.name AS club_name FROM events e JOIN clubs c ON c.id=e.club_id WHERE e.id=$1`, [id]);
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  await assertManages(req.user, ev.club_id);
  await q(`UPDATE events SET status='cancelled', updated_at=now() WHERE id=$1`, [id]);
  const people = await many(`SELECT user_id FROM registrations WHERE event_id=$1 AND status IN ('going','waitlist')`, [id]);
  for (const p of people) {
    await notifyUser(p.user_id, `❌ <b>${ev.title.replace(/[<>&]/g, '')}</b> (${ev.club_name}) on ${formatWhen(ev.starts_at)} has been cancelled by the organiser.`);
  }
  res.json({ ok: true, notified: people.length });
}));

async function participants(eventId) {
  return many(`
    SELECT u.name, u.email, r.status, r.created_at, (u.telegram_chat_id IS NOT NULL) AS telegram
    FROM registrations r JOIN users u ON u.id=r.user_id
    WHERE r.event_id=$1 AND r.status IN ('going','waitlist')
    ORDER BY CASE r.status WHEN 'going' THEN 0 ELSE 1 END, r.updated_at, r.id`, [eventId]);
}

api.get('/organizer/events/:id/participants', requireUser, wrap(async (req, res) => {
  const ev = await one('SELECT * FROM events WHERE id=$1', [Number(req.params.id)]);
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  await assertManages(req.user, ev.club_id);
  res.json({ participants: await participants(ev.id) });
}));

api.get('/organizer/events/:id/participants.csv', requireUser, wrap(async (req, res) => {
  const ev = await one('SELECT * FROM events WHERE id=$1', [Number(req.params.id)]);
  if (!ev) return res.status(404).send('Not found');
  await assertManages(req.user, ev.club_id);
  const rows = await participants(ev.id);
  const lines = [['#', 'Name', 'Email', 'Status', 'Registered at', 'Telegram connected']];
  rows.forEach((r, i) => lines.push([i + 1, r.name, r.email, r.status, formatWhen(r.created_at), r.telegram ? 'yes' : 'no']));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="participants-event-${ev.id}.csv"`);
  // BOM so Excel opens Cyrillic names correctly
  res.send('﻿' + lines.map(l => l.map(csvEscape).join(',')).join('\r\n'));
}));

// ---------- Admin: assign organisers to clubs ----------
api.get('/admin/organizers', requireUser, requireAdmin, wrap(async (_req, res) => {
  const rows = await many(`
    SELECT c.id AS club_id, c.name AS club_name, u.id AS user_id, u.email, u.name
    FROM club_organizers o JOIN clubs c ON c.id=o.club_id JOIN users u ON u.id=o.user_id ORDER BY c.name, u.email`);
  const clubs = await many(`SELECT id, name, president, president_tg, status FROM clubs ORDER BY name`);
  const stats = await one(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM events WHERE status='published') AS events,
      (SELECT count(*)::int FROM registrations WHERE status='going') AS registrations,
      (SELECT count(*)::int FROM users WHERE telegram_chat_id IS NOT NULL) AS telegram`);
  res.json({ organizers: rows, clubs, stats });
}));

const assignSchema = z.object({ email: z.string().trim().toLowerCase().email(), clubId: z.number().int() });
api.post('/admin/organizers', requireUser, requireAdmin, wrap(async (req, res) => {
  const p = assignSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Enter an email and choose a club.' });
  const { email, clubId } = p.data;
  if (!email.endsWith('@' + config.emailDomain)) return res.status(400).json({ error: `The email must end in @${config.emailDomain}.` });
  const u = await one(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, 'organizer')
     ON CONFLICT (email) DO UPDATE SET role = CASE WHEN users.role='admin' THEN 'admin' ELSE 'organizer' END
     RETURNING id`, [email, email.split('@')[0].replace(/[._]/g, ' ')]);
  await q(`INSERT INTO club_organizers (club_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [clubId, u.id]);
  res.json({ ok: true });
}));
api.delete('/admin/organizers', requireUser, requireAdmin, wrap(async (req, res) => {
  const { clubId, userId } = req.body || {};
  await q(`DELETE FROM club_organizers WHERE club_id=$1 AND user_id=$2`, [clubId, userId]);
  const left = await one(`SELECT count(*)::int AS n FROM club_organizers WHERE user_id=$1`, [userId]);
  if (left.n === 0) await q(`UPDATE users SET role='student' WHERE id=$1 AND role='organizer'`, [userId]);
  res.json({ ok: true });
}));

// ---------- External cron (keeps reminders on time on free hosting) ----------
api.all('/cron/tick', wrap(async (req, res) => {
  if (!config.cronSecret || req.query.key !== config.cronSecret) return res.status(403).json({ error: 'Forbidden' });
  res.json(await runReminders());
}));

api.get('/health', (_req, res) => res.json({ ok: true }));

// Error handler for the API.
api.use((err, _req, res, _next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});
