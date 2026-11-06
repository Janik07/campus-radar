import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useSession, useToast } from './session.jsx';
import { CATEGORY_HUE, timeOf, dayNum, monthShort } from './format.js';

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />
      <g className="sweep"><path d="M16 16 L16 6 A10 10 0 0 1 25.5 13 Z" fill="#fff" fillOpacity=".35" /></g>
      <circle cx="22" cy="11" r="2.2" fill="#fff" />
    </svg>
  );
}

export function CategoryTag({ category }) {
  return <span className="cat" style={{ '--h': CATEGORY_HUE[category] ?? 160 }}>{category}</span>;
}

export function StatusBadge({ ev }) {
  if (ev.status === 'cancelled') return <span className="badge badge-bad">Cancelled</span>;
  if (ev.myStatus === 'going') return <span className="badge badge-ok">You’re going</span>;
  if (ev.myStatus === 'waitlist') return <span className="badge badge-warn">On waitlist</span>;
  if (ev.capacity != null && ev.spotsLeft === 0) return <span className="badge badge-warn">Full · waitlist open</span>;
  if (ev.capacity != null && ev.spotsLeft <= 5) return <span className="badge badge-warn">{ev.spotsLeft} {ev.spotsLeft === 1 ? 'spot' : 'spots'} left</span>;
  return null;
}

export function EventCard({ ev, showDate = false }) {
  return (
    <Link to={`/events/${ev.id}`} className="card event-card">
      <div className="ec-time">
        {showDate && <span className="ec-date">{dayNum(ev.startsAt)} {monthShort(ev.startsAt)}</span>}
        <span className="mono">{timeOf(ev.startsAt)}</span>
      </div>
      <div className="ec-body">
        <div className="ec-top"><CategoryTag category={ev.category} /><StatusBadge ev={ev} /></div>
        <h3 className="ec-title">{ev.title}</h3>
        <p className="ec-meta">
          <span>{ev.club.name}</span><span aria-hidden="true">·</span><span>{ev.location}</span>
        </p>
        <p className="ec-count">
          {ev.goingCount} going{ev.capacity != null && <> of {ev.capacity}</>}
          {ev.waitlistCount > 0 && <> · {ev.waitlistCount} waiting</>}
        </p>
      </div>
    </Link>
  );
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
    <button className={`btn btn-primary ${size}`} disabled={busy} onClick={() => act('POST')}>
      {busy ? 'Saving…' : full ? 'Join waitlist' : 'Register'}
    </button>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle cx="28" cy="28" r="14" fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle cx="28" cy="28" r="3" fill="var(--muted)" />
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
