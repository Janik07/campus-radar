import { config } from './config.js';

export const CATEGORIES = ['Tech', 'Sport', 'Games', 'Arts', 'Music', 'Culture', 'Intellectual', 'Social', 'Media', 'Career'];

export function formatWhen(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));
}

// iCalendar file for US-09 (add to calendar).
export function toIcs(ev, url) {
  const fmt = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 2 * 3600e3);
  const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Radar//AITU//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${ev.id}@campus-radar`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.starts_at)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `LOCATION:${esc(ev.location)}`,
    `DESCRIPTION:${esc(ev.description + (url ? `\n\n${url}` : ''))}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
