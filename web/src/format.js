// Dates are always shown in Astana time (UTC+5), whatever the visitor's device says.
export const TZ = 'Asia/Almaty';

const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
export const timeOf = d => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(d));
export const dayKey = d => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
export const longDate = d => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
export const shortDate = d => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
export const dayNum = d => fmt({ day: 'numeric' }).format(new Date(d));
export const monthShort = d => fmt({ month: 'short' }).format(new Date(d));
export const weekdayShort = d => fmt({ weekday: 'short' }).format(new Date(d));

export function dayLabel(d) {
  const k = dayKey(d);
  if (k === dayKey(new Date())) return 'Today';
  if (k === dayKey(Date.now() + 864e5)) return 'Tomorrow';
  return longDate(d);
}

// "2026-11-07" + "18:30" in Astana time → ISO string
export const toIso = (date, time) => new Date(`${date}T${time}:00+05:00`).toISOString();

// ISO → { date: "2026-11-07", time: "18:30" } in Astana time
export function fromIso(iso) {
  if (!iso) return { date: '', time: '' };
  const parts = Object.fromEntries(
    fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function googleCalendarUrl(ev) {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = ev.endsAt || new Date(new Date(ev.startsAt).getTime() + 2 * 3600e3);
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: ev.title, dates: `${f(ev.startsAt)}/${f(end)}`,
    details: `${ev.club.name}\n\n${ev.description}\n\n${location.origin}/events/${ev.id}`, location: ev.location,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export const CATEGORY_HUE = {
  Tech: 215, Sport: 18, Games: 265, Arts: 330, Music: 295, Culture: 40, Intellectual: 190, Social: 150, Media: 350, Career: 100,
};
