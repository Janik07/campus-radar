// US-05: sign in with the university email (passwordless, one-time code).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { q, one } from './db.js';
import { sendLoginCode } from './mail.js';

const COOKIE = 'radar_session';
const CODE_TTL_MIN = 10;

export function isAllowedEmail(email) {
  return email.endsWith('@' + config.emailDomain);
}

function issueSession(res, user) {
  const token = jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https'),
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

// Attaches req.user (or null) on every request.
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, config.jwtSecret);
      req.user = await one('SELECT * FROM users WHERE id=$1', [uid]);
    } catch { /* invalid or expired token */ }
  }
  next();
}

export const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please sign in first.' });

export const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Only administrators can do this.' });

// Returns the club ids a user may manage (admins manage every club).
export async function managedClubIds(user) {
  if (!user) return [];
  if (user.role === 'admin') return (await q('SELECT id FROM clubs')).rows.map(r => r.id);
  return (await q('SELECT club_id FROM club_organizers WHERE user_id=$1', [user.id])).rows.map(r => r.club_id);
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    telegramLinked: !!u.telegram_chat_id, telegramUsername: u.telegram_username,
    notify24h: u.notify_24h, notify1h: u.notify_1h,
  };
}

export const authRouter = Router();

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });

authRouter.post('/request-code', async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });
  const { email } = parsed.data;
  if (!isAllowedEmail(email)) {
    return res.status(400).json({ error: `Use your university email ending in @${config.emailDomain}.` });
  }
  // Basic rate limit: max 5 codes per email per 15 minutes.
  const recent = await one(
    `SELECT count(*)::int AS n FROM login_codes WHERE email=$1 AND created_at > now() - interval '15 minutes'`, [email]);
  if (recent.n >= 5) return res.status(429).json({ error: 'Too many codes requested. Try again in 15 minutes.' });

  const code = String(crypto.randomInt(100000, 1000000));
  await q(`INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1,$2, now() + $3::interval)`,
    [email, await bcrypt.hash(code, 8), `${CODE_TTL_MIN} minutes`]);

  const sent = await sendLoginCode(email, code);
  const body = { ok: true, ttlMinutes: CODE_TTL_MIN, delivered: sent };
  // Without an email service, demo mode returns the code so the flow can be shown live.
  if (!sent && config.demoMode) body.demoCode = code;
  if (!sent && !config.demoMode) return res.status(503).json({ error: 'Email service is not configured.' });
  res.json(body);
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  name: z.string().trim().max(80).optional(),
});

authRouter.post('/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code from the email.' });
  const { email, code, name } = parsed.data;

  const row = await one(
    `SELECT * FROM login_codes WHERE email=$1 AND used=false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`, [email]);
  if (!row) return res.status(400).json({ error: 'The code has expired. Request a new one.' });
  if (row.attempts >= 5) return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
  if (!(await bcrypt.compare(code, row.code_hash))) {
    await q('UPDATE login_codes SET attempts = attempts + 1 WHERE id=$1', [row.id]);
    return res.status(400).json({ error: 'Wrong code. Check the email and try again.' });
  }
  await q('UPDATE login_codes SET used=true WHERE id=$1', [row.id]);

  const role = config.adminEmails.includes(email) ? 'admin' : 'student';
  const fallbackName = email.split('@')[0].replace(/[._]/g, ' ');
  const user = await one(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET
       name = CASE WHEN $4::text <> '' THEN $4 ELSE users.name END,
       role = CASE WHEN $3 = 'admin' THEN 'admin' ELSE users.role END
     RETURNING *`,
    [email, name || fallbackName, role, name || '']);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null, clubs: [] });
  const clubs = await q(
    req.user.role === 'admin'
      ? `SELECT id, name, slug, category FROM clubs ORDER BY name`
      : `SELECT c.id, c.name, c.slug, c.category FROM clubs c JOIN club_organizers o ON o.club_id=c.id WHERE o.user_id=$1 ORDER BY c.name`,
    req.user.role === 'admin' ? [] : [req.user.id]);
  res.json({ user: publicUser(req.user), clubs: clubs.rows });
});
