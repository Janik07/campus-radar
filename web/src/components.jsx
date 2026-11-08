import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useSession, useToast } from './session.jsx';
import { CATEGORY_HUE, timeOf, dayNum, monthShort, weekdayShort } from './format.js';

export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffc83d" /><stop offset="1" stopColor="#ff5a3c" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.6" />
      <g className="sweep"><path d="M16 16 L16 6 A10 10 0 0 1 25.5 13 Z" fill="#fff" fillOpacity=".45" /></g>
      <circle cx="22" cy="11" r="2.3" fill="#fff" />
    </svg>
  );
}

// Small line icons (no emoji), drawn with currentColor.
export const Icon = ({ name, size = 18 }) => {
  const d = {
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
    calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2',
  }[name];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
};

export function CategoryTag({ category }) {
  return <span className="cat" style={{ '--h': CATEGORY_HUE[category] ?? 160 }}>{category}</span>;
}

export function StatusBadge({ ev }) {
  if (ev.status === 'cancelled') return <span className="badge badge-bad">Cancelled</span>;
  if (ev.myStatus === 'going') return <span className="badge badge-ok">You’re going</span>;
  if (ev.myStatus === 'waitlist') return <span className="badge badge-warn">On waitlist</span>;
  if (ev.capacity != null && ev.spotsLeft === 0) return <span className="badge badge-bad">Full · join waitlist</span>;
  if (ev.capacity != null && ev.spotsLeft <= 5) return <span className="badge badge-warn">{ev.spotsLeft} {ev.spotsLeft === 1 ? 'spot' : 'spots'} left</span>;
  return null;
}

const FACE_HUES = [14, 172, 45, 262, 330, 200];
export function Faces({ count }) {
  const n = Math.min(4, count);
  return (
    <span className="faces">
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ background: `hsl(${FACE_HUES[i]} 75% 60%)` }} />)}
      <em>{count} going</em>
    </span>
  );
}

export function EventCard({ ev }) {
  const pct = ev.capacity ? Math.min(100, Math.round((ev.goingCount / ev.capacity) * 100)) : null;
  return (
    <Link to={`/events/${ev.id}`} className="card event-card">
      <div className="ec-media">
        <img src={thumb(ev.imageUrl, 640)} alt="" loading="lazy" />
        <div className="ec-date"><span>{monthShort(ev.startsAt)}</span><b>{dayNum(ev.startsAt)}</b></div>
        <div className="ec-flags"><StatusBadge ev={ev} />{ev.followed && <span className="badge badge-teal">Following</span>}</div>
        <div className="ec-cat"><CategoryTag category={ev.category} /></div>
      </div>
      <div className="ec-body">
        <h3 className="ec-title">{ev.title}</h3>
        <div className="ec-meta">
          <span><Icon name="clock" size={15} />{weekdayShort(ev.startsAt)}, {timeOf(ev.startsAt)} · {ev.club.name}</span>
          <span><Icon name="pin" size={15} />{ev.location}</span>
        </div>
        <div className="ec-foot">
          {ev.goingCount > 0 ? <Faces count={ev.goingCount} /> : <span>Be the first to join</span>}
          {pct != null && <span className={`minibar ${pct >= 100 ? 'full' : ''}`} title={`${ev.goingCount} of ${ev.capacity} places`}><i style={{ width: pct + '%' }} /></span>}
        </div>
      </div>
    </Link>
  );
}

// Unsplash images can be resized through the URL; other links are used as they are.
export function thumb(url, w) {
  if (!url) return '';
  return url.includes('images.unsplash.com') ? url.replace(/w=\d+/, `w=${w}`) : url;
}

// One-tap registration (US-06) with waitlist (US-07).
export function RegisterButton({ ev, onChange, size = '' }) {
  const { user } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const started = new Date(ev.startsAt) < new Date();

  if (ev.status === 'cancelled') return <button className={`btn ${size}`} disabled>Event cancelled</button>;
  if (started) return <button className={`btn ${size}`} disabled>Already started</button>;

  const act = async (method) => {
    if (!user) return nav(`/login?next=/events/${ev.id}`);
    setBusy(true);
    try {
      const r = await api(`/events/${ev.id}/register`, { method });
      if (r.status === 'going') toast('You’re registered. See you there!');
      else if (r.status === 'waitlist') toast(`The event is full. You are #${r.position} on the waitlist.`, 'warn');
      else toast('Registration cancelled.');
      await onChange?.();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (ev.myStatus === 'going' || ev.myStatus === 'waitlist') {
    return (
      <button className={`btn btn-ghost ${size}`} disabled={busy} onClick={() => act('DELETE')}>
        {busy ? 'Cancelling…' : ev.myStatus === 'going' ? 'Cancel registration' : 'Leave waitlist'}
      </button>
    );
  }
  const full = ev.capacity != null && ev.spotsLeft === 0;
  return (
    <button className={`btn ${full ? 'btn-dark' : 'btn-primary'} ${size}`} disabled={busy} onClick={() => act('POST')}>
      {busy ? 'Saving…' : full ? 'Join the waitlist' : 'Register — it’s free'}
    </button>
  );
}

export function FollowButton({ club, onChange, size = 'btn-sm' }) {
  const { user } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const toggle = async e => {
    e.preventDefault(); e.stopPropagation();
    if (!user) return nav(`/login?next=/clubs/${club.slug}`);
    setBusy(true);
    try {
      await api(`/clubs/${club.id}/follow`, { method: club.followed ? 'DELETE' : 'POST' });
      toast(club.followed ? `Unfollowed ${club.name}` : `Following ${club.name} — its events show first`);
      await onChange?.();
    } catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <button className={`btn btn-follow ${size}`} aria-pressed={!!club.followed} disabled={busy} onClick={toggle}>
      {club.followed ? <><Icon name="check" size={15} />Following</> : '+ Follow'}
    </button>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <svg width="64" height="64" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="24" fill="var(--accent-soft)" />
        <circle cx="28" cy="28" r="14" fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth="2" />
        <circle cx="35" cy="21" r="3.5" fill="var(--accent)" />
      </svg>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;

export function ErrorNote({ error }) {
  if (!error) return null;
  return <p className="error-note" role="alert">{error}</p>;
}
