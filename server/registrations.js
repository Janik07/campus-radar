import crypto from 'node:crypto';
// US-06 / US-07: one-tap registration with participant limit and waitlist.
import { tx, one } from './db.js';
import { notifyUser } from './telegram.js';
import { formatWhen } from './util.js';

// Registers the user; returns { status: 'going' | 'waitlist', position? }.
export async function register(eventId, userId) {
  return tx(async c => {
    // Lock the event row so two students cannot take the last seat at the same time.
    const ev = await c.one(`SELECT * FROM events WHERE id=$1 FOR UPDATE`, [eventId]);
    if (!ev || ev.status !== 'published') throw httpError(404, 'This event is not available.');
    if (new Date(ev.starts_at) < new Date()) throw httpError(400, 'This event has already started.');

    const existing = await c.one(`SELECT * FROM registrations WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
    if (existing && existing.status !== 'cancelled') return describe(c, ev, existing);

    const { n } = await c.one(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status='going'`, [eventId]);
    const status = ev.capacity == null || n < ev.capacity ? 'going' : 'waitlist';
    // Every registration gets a ticket: a QR token and a 6-digit code for check-in (US-14).
    const reg = await c.one(
      `INSERT INTO registrations (event_id, user_id, status, checkin_code, checkin_token) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status=$3, updated_at=now(),
         checkin_code=coalesce(registrations.checkin_code,$4), checkin_token=coalesce(registrations.checkin_token,$5)
       RETURNING *`,
      [eventId, userId, status, String(crypto.randomInt(100000, 1000000)), crypto.randomBytes(12).toString('base64url')]);
    return describe(c, ev, reg);
  });
}

// Cancels the user's place; the first person on the waitlist takes it.
export async function cancel(eventId, userId) {
  const promoted = await tx(async c => {
    const ev = await c.one(`SELECT * FROM events WHERE id=$1 FOR UPDATE`, [eventId]);
    if (!ev) throw httpError(404, 'Event not found.');
    const reg = await c.one(`SELECT * FROM registrations WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
    if (!reg || reg.status === 'cancelled') return [];
    await c.q(`UPDATE registrations SET status='cancelled', updated_at=now() WHERE id=$1`, [reg.id]);
    if (reg.status !== 'going') return [];
    return fillFreeSeats(c, ev);
  });
  await announcePromotions(eventId, promoted);
  return { status: 'cancelled' };
}

// Moves people from the waitlist while seats are free. Call inside a transaction with the event locked.
export async function fillFreeSeats(c, ev) {
  const { n } = await c.one(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status='going'`, [ev.id]);
  const free = ev.capacity == null ? Infinity : ev.capacity - n;
  if (free <= 0) return [];
  const rows = await c.many(
    `UPDATE registrations SET status='going', updated_at=now()
     WHERE id IN (SELECT id FROM registrations WHERE event_id=$1 AND status='waitlist'
                  ORDER BY updated_at, id LIMIT $2)
     RETURNING user_id`, [ev.id, free === Infinity ? 100000 : free]);
  return rows.map(r => r.user_id);
}

export async function announcePromotions(eventId, userIds) {
  if (!userIds.length) return;
  const ev = await one(`SELECT e.*, c.name AS club_name FROM events e JOIN clubs c ON c.id=e.club_id WHERE e.id=$1`, [eventId]);
  for (const uid of userIds) {
    await notifyUser(uid,
      `🎉 A place opened up — you are now registered for <b>${esc(ev.title)}</b> (${esc(ev.club_name)}).\n` +
      `🗓 ${formatWhen(ev.starts_at)}\n📍 ${esc(ev.location)}`);
  }
}

async function describe(c, ev, reg) {
  if (reg.status !== 'waitlist') return { status: reg.status };
  const { pos } = await c.one(
    `SELECT count(*)::int AS pos FROM registrations w, registrations me
     WHERE me.id=$2 AND w.event_id=$1 AND w.status='waitlist' AND (w.updated_at, w.id) <= (me.updated_at, me.id)`,
    [ev.id, reg.id]);
  return { status: 'waitlist', position: pos };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
