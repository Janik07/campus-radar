import { Router } from 'express';
import { z } from 'zod';
import { q, one, many, tx } from './db.js';
import { config } from './config.js';
import { requireUser, requireAdmin, managedClubIds, publicUser } from './auth.js';
import { register, cancel, fillFreeSeats, announcePromotions, httpError } from './registrations.js';
import { notifyUser, newLinkToken, telegramEnabled, getBotUsername } from './telegram.js';
import { runReminders } from './reminders.js';
import QRCode from 'qrcode';
import { CATEGORIES, toIcs, csvEscape, formatWhen } from './util.js';
import { CATEGORY_PHOTO } from './demo.js';

export const api = Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// Common SELECT for event cards: counts and the current user's status.
const EVENT_SELECT = `
  SELECT e.*, c.name AS club_name, c.slug AS club_slug, c.telegram_url AS club_telegram,
    (SELECT count(*)::int FROM registrations r WHERE r.event_id=e.id AND r.status='going') AS going_count,
    (SELECT count(*)::int FROM registrations r WHERE r.event_id=e.id AND r.status='waitlist') AS waitlist_count,
    (SELECT count(*)::int FROM registrations r WHERE r.event_id=e.id AND r.checked_in_at IS NOT NULL) AS checked_in_count,
    (SELECT r.status FROM registrations r WHERE r.event_id=e.id AND r.user_id=$1) AS my_status,
    EXISTS (SELECT 1 FROM club_follows f WHERE f.club_id=e.club_id AND f.user_id=$1) AS followed
  FROM events e JOIN clubs c ON c.id = e.club_id`;

const shapeEvent = e => ({
  id: e.id, title: e.title, description: e.description, category: e.category, location: e.location,
  startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, status: e.status,
  club: { id: e.club_id, name: e.club_name, slug: e.club_slug, telegramUrl: e.club_telegram },
  imageUrl: e.image_url || CATEGORY_PHOTO[e.category] || '', hasOwnImage: !!e.image_url,
  followed: !!e.followed, checkedInCount: e.checked_in_count,
  goingCount: e.going_count, waitlistCount: e.waitlist_count,
  myStatus: e.my_status === 'cancelled' ? null : e.my_status,
  spotsLeft: e.capacity == null ? null : Math.max(0, e.capacity - e.going_count),
});

api.get('/meta', (_req, res) => res.json({
  categories: CATEGORIES,
  categoryPhotos: CATEGORY_PHOTO,
  emailDomain: config.emailDomain,
  demoMode: config.demoMode && !config.resendApiKey,
  telegram: { enabled: telegramEnabled(), username: getBotUsername() },
}));

// ---------- US-01 / US-02: feed with filters ----------
api.get('/events', wrap(async (req, res) => {
  const { category, when, q: search, club, following } = req.query;
  const params = [req.user?.id ?? null];
  const where = [`e.status='published'`, `coalesce(e.ends_at, e.starts_at + interval '2 hours') > now()`];
  if (category && CATEGORIES.includes(category)) { params.push(category); where.push(`e.category=$${params.length}`); }
  if (club) { params.push(club); where.push(`c.slug=$${params.length}`); }
  if (following === '1' && req.user) where.push(`EXISTS (SELECT 1 FROM club_follows f WHERE f.club_id=e.club_id AND f.user_id=$1)`);
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
  if (out.myStatus === 'going') {
    const t = await one(`SELECT checkin_code, checked_in_at FROM registrations WHERE event_id=$1 AND user_id=$2`, [e.id, req.user.id]);
    out.ticket = { code: t.checkin_code, checkedInAt: t.checked_in_at };
  }
  const ids = await managedClubIds(req.user);
  out.canManage = ids.includes(e.club_id);
  res.json({ event: out });
}));

// ---------- US-14: ticket QR and check-in ----------
const siteOrigin = req => config.publicUrl || `${req.protocol}://${req.get('host')}`;

api.get('/events/:id/ticket.svg', requireUser, wrap(async (req, res) => {
  const r = await one(`SELECT checkin_token FROM registrations WHERE event_id=$1 AND user_id=$2 AND status='going'`,
    [Number(req.params.id) || 0, req.user.id]);
  if (!r?.checkin_token) return res.status(404).send('No ticket');
  const svg = await QRCode.toString(`${siteOrigin(req)}/checkin/${r.checkin_token}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14213d', light: '#ffffff' } });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(svg);
}));

async function markCheckedIn(where, params, user) {
  const r = await one(`
    SELECT r.id, r.status, r.checked_in_at, r.event_id, e.club_id, e.title, u.name, u.email
    FROM registrations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id WHERE ${where}`, params);
  if (!r) throw httpError(404, 'Ticket not found. Check the code and try again.');
  await assertManages(user, r.club_id);
  if (r.status !== 'going') throw httpError(400, `${r.name} is not registered for this event (status: ${r.status}).`);
  const already = !!r.checked_in_at;
  if (!already) await q(`UPDATE registrations SET checked_in_at=now() WHERE id=$1`, [r.id]);
  return { ok: true, already, name: r.name, email: r.email, eventId: r.event_id, eventTitle: r.title };
}

// Organiser scans the student's QR with the phone camera; the link opens /checkin/:token.
api.post('/checkin/:token', requireUser, wrap(async (req, res) => {
  res.json(await markCheckedIn('r.checkin_token=$1', [req.params.token], req.user));
}));

// Fallback: the 6-digit code under the QR, or a tick in the participant list.
api.post('/organizer/events/:id/checkin', requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { code, userId, undo } = req.body || {};
  if (undo && userId) {
    const ev = await one('SELECT club_id FROM events WHERE id=$1', [id]);
    if (!ev) return res.status(404).json({ error: 'Event not found.' });
    await assertManages(req.user, ev.club_id);
    await q(`UPDATE registrations SET checked_in_at=NULL WHERE event_id=$1 AND user_id=$2`, [id, userId]);
    return res.json({ ok: true });
  }
  if (userId) return res.json(await markCheckedIn('r.event_id=$1 AND r.user_id=$2', [id, userId], req.user));
  if (!/^\d{6}$/.test(String(code || ''))) return res.status(400).json({ error: 'Enter the 6-digit code from the ticket.' });
  res.json(await markCheckedIn('r.event_id=$1 AND r.checkin_code=$2', [id, String(code)], req.user));
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
const CLUB_SELECT = `
    SELECT c.id, c.slug, c.name, c.category, c.status, c.description, c.telegram_url,
      (SELECT count(*)::int FROM events e WHERE e.club_id=c.id AND e.status='published' AND e.starts_at > now()) AS upcoming,
      (SELECT count(*)::int FROM club_follows f WHERE f.club_id=c.id) AS followers,
      EXISTS (SELECT 1 FROM club_follows f WHERE f.club_id=c.id AND f.user_id=$1) AS followed,
      (SELECT e.image_url FROM events e WHERE e.club_id=c.id AND e.image_url<>'' ORDER BY e.starts_at DESC LIMIT 1) AS cover
    FROM clubs c`;
const shapeClub = c => ({
  id: c.id, slug: c.slug, name: c.name, category: c.category, status: c.status, description: c.description,
  telegramUrl: c.telegram_url, upcoming: c.upcoming, followers: c.followers, followed: c.followed,
  coverUrl: c.cover || CATEGORY_PHOTO[c.category] || '',
});
api.get('/clubs', wrap(async (req, res) => {
  const rows = await many(`${CLUB_SELECT} WHERE c.status IN ('active','probation') ORDER BY c.name`, [req.user?.id ?? null]);
  res.json({ clubs: rows.map(shapeClub) });
}));
// US-12: follow a club
api.post('/clubs/:id/follow', requireUser, wrap(async (req, res) => {
  await q(`INSERT INTO club_follows (user_id, club_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, Number(req.params.id)]);
  res.json({ followed: true });
}));
api.delete('/clubs/:id/follow', requireUser, wrap(async (req, res) => {
  await q(`DELETE FROM club_follows WHERE user_id=$1 AND club_id=$2`, [req.user.id, Number(req.params.id)]);
  res.json({ followed: false });
}));
api.get('/clubs/:slug', wrap(async (req, res) => {
  const row = await one(`${CLUB_SELECT} WHERE c.slug=$2`, [req.user?.id ?? null, req.params.slug]);
  if (!row) return res.status(404).json({ error: 'Club not found.' });
  const c = { ...row, telegram_url: row.telegram_url };
  const events = await many(`${EVENT_SELECT} WHERE e.club_id=$2 AND e.status='published' AND e.starts_at > now() ORDER BY e.starts_at`,
    [req.user?.id ?? null, c.id]);
  res.json({ club: shapeClub(row), events: events.map(shapeEvent) });
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
  imageUrl: z.string().trim().max(1000).refine(v => v === '' || /^https:\/\//.test(v), 'The poster link must start with https://').optional(),
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
    `INSERT INTO events (club_id,title,description,category,location,starts_at,ends_at,capacity,created_by,image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [d.clubId, d.title, d.description, d.category, d.location, d.startsAt, d.endsAt ?? null, d.capacity ?? null, req.user.id, d.imageUrl || '']);
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
      `UPDATE events SET club_id=$2,title=$3,description=$4,category=$5,location=$6,starts_at=$7,ends_at=$8,capacity=$9,image_url=$10,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, d.clubId, d.title, d.description, d.category, d.location, d.startsAt, d.endsAt ?? null, d.capacity ?? null, d.imageUrl || '']);
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
    SELECT u.id AS user_id, u.name, u.email, r.status, r.created_at, r.checked_in_at, (u.telegram_chat_id IS NOT NULL) AS telegram
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
  const lines = [['#', 'Name', 'Email', 'Status', 'Registered at', 'Checked in', 'Telegram connected']];
  rows.forEach((r, i) => lines.push([i + 1, r.name, r.email, r.status, formatWhen(r.created_at), r.checked_in_at ? formatWhen(r.checked_in_at) : '', r.telegram ? 'yes' : 'no']));
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

// ---------- US-15: attendance dashboard for the Department of Social and Educational Work ----------
async function analytics() {
  const totals = await one(`
    SELECT count(DISTINCT e.id)::int AS events_held,
      count(r.id) FILTER (WHERE r.status='going')::int AS registrations,
      count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS attended,
      count(DISTINCT r.user_id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS unique_students,
      count(DISTINCT e.club_id)::int AS active_clubs
    FROM events e LEFT JOIN registrations r ON r.event_id=e.id
    WHERE e.status='published' AND e.starts_at < now() AND e.starts_at > now() - interval '120 days'`);
  const upcoming = await one(`SELECT count(*)::int AS n, coalesce(sum((SELECT count(*) FROM registrations r WHERE r.event_id=e.id AND r.status='going')),0)::int AS regs
    FROM events e WHERE e.status='published' AND e.starts_at > now()`);
  const clubs = await many(`
    SELECT c.id, c.name, c.category,
      count(DISTINCT e.id)::int AS events,
      count(r.id) FILTER (WHERE r.status='going')::int AS registrations,
      count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS attended,
      (SELECT count(*)::int FROM club_follows f WHERE f.club_id=c.id) AS followers
    FROM clubs c JOIN events e ON e.club_id=c.id AND e.status='published' AND e.starts_at < now() AND e.starts_at > now() - interval '120 days'
    LEFT JOIN registrations r ON r.event_id=e.id
    GROUP BY c.id ORDER BY attended DESC, registrations DESC`);
  const categories = await many(`
    SELECT e.category, count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS attended,
      count(r.id) FILTER (WHERE r.status='going')::int AS registrations
    FROM events e LEFT JOIN registrations r ON r.event_id=e.id
    WHERE e.status='published' AND e.starts_at < now() AND e.starts_at > now() - interval '120 days'
    GROUP BY e.category ORDER BY attended DESC`);
  const weeks = await many(`
    SELECT to_char(date_trunc('week', e.starts_at AT TIME ZONE $1), 'YYYY-MM-DD') AS week,
      count(DISTINCT e.id)::int AS events,
      count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS attended,
      count(r.id) FILTER (WHERE r.status='going')::int AS registrations
    FROM events e LEFT JOIN registrations r ON r.event_id=e.id
    WHERE e.status='published' AND e.starts_at < now() AND e.starts_at > now() - interval '8 weeks'
    GROUP BY 1 ORDER BY 1`, [config.timezone]);
  const events = await many(`
    SELECT e.id, e.title, e.starts_at, c.name AS club_name, e.capacity,
      count(r.id) FILTER (WHERE r.status='going')::int AS registrations,
      count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS attended
    FROM events e JOIN clubs c ON c.id=e.club_id LEFT JOIN registrations r ON r.event_id=e.id
    WHERE e.status='published' AND e.starts_at < now() AND e.starts_at > now() - interval '120 days'
    GROUP BY e.id, c.name ORDER BY e.starts_at DESC LIMIT 100`);
  return { totals, upcoming, clubs, categories, weeks, events };
}

api.get('/admin/analytics', requireUser, requireAdmin, wrap(async (_req, res) => res.json(await analytics())));
api.get('/admin/analytics.csv', requireUser, requireAdmin, wrap(async (_req, res) => {
  const a = await analytics();
  const rate = (x, y) => (y ? Math.round((x / y) * 100) + '%' : '');
  const lines = [['Club', 'Category', 'Events held', 'Registrations', 'Attended', 'Attendance rate', 'Followers']];
  a.clubs.forEach(c => lines.push([c.name, c.category, c.events, c.registrations, c.attended, rate(c.attended, c.registrations), c.followers]));
  lines.push([]);
  lines.push(['Event', 'Club', 'Date', 'Registrations', 'Attended', 'Attendance rate']);
  a.events.forEach(e => lines.push([e.title, e.club_name, formatWhen(e.starts_at), e.registrations, e.attended, rate(e.attended, e.registrations)]));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="campus-radar-attendance.csv"');
  res.send('\uFEFF' + lines.map(l => l.map(csvEscape).join(',')).join('\r\n'));
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
