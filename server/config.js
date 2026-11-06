// All settings come from environment variables (see .env.example).
import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader so the project runs without extra packages.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://radar:radar@localhost:54329/radar',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  emailDomain: (process.env.EMAIL_DOMAIN || 'astanait.edu.kz').toLowerCase(),
  adminEmails: (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean),
  // DEMO_MODE shows the sign-in code on screen when no email service is configured.
  demoMode: bool(process.env.DEMO_MODE, true),
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'Campus Radar <onboarding@resend.dev>',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
  cronSecret: process.env.CRON_SECRET || '',
  timezone: process.env.APP_TIMEZONE || 'Asia/Almaty',
  dbSsl: bool(process.env.DATABASE_SSL, /neon\.tech|supabase|render\.com/.test(process.env.DATABASE_URL || '')),
};
