// US-03 event page, US-06/07 registration, US-09 add to calendar
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession, useToast } from '../session.jsx';
import { CategoryTag, RegisterButton, StatusBadge, Spinner, Empty } from '../components.jsx';
import { longDate, timeOf, googleCalendarUrl } from '../format.js';

export default function EventPage() {
  const { id } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api(`/events/${id}`).then(d => setEv(d.event)).catch(e => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Empty title={error}><Link to="/">Back to events</Link></Empty>;
  if (!ev) return <div className="center"><Spinner /></div>;

  const pct = ev.capacity ? Math.min(100, Math.round((ev.goingCount / ev.capacity) * 100)) : null;
  const share = async () => {
    const url = `${location.origin}/events/${ev.id}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
  };

  return (
    <article className="event-page">
      <Link to="/" className="back">← All events</Link>
      <div className="ep-head">
        <div className="ep-tags"><CategoryTag category={ev.category} /><StatusBadge ev={ev} /></div>
        <h1>{ev.title}</h1>
        <p className="ep-club">by <Link to={`/clubs/${ev.club.slug}`}>{ev.club.name}</Link></p>
      </div>

      <div className="ep-grid">
        <div className="ep-main">
          <dl className="facts">
            <div><dt>When</dt><dd>{longDate(ev.startsAt)}<br /><span className="mono">{timeOf(ev.startsAt)}{ev.endsAt && `–${timeOf(ev.endsAt)}`}</span></dd></div>
            <div><dt>Where</dt><dd>{ev.location}</dd></div>
            <div><dt>Organiser</dt><dd>{ev.club.name}{ev.club.telegramUrl && <> · <a href={ev.club.telegramUrl} target="_blank" rel="noreferrer">Telegram</a></>}</dd></div>
          </dl>
          {ev.description && <div className="ep-desc">{ev.description.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>}
        </div>

        <aside className="card ep-side">
          <div className="seats">
            <p className="seats-num"><b>{ev.goingCount}</b>{ev.capacity != null ? ` / ${ev.capacity} places taken` : ' going'}</p>
            {pct != null && <div className="meter" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>}
            {ev.waitlistCount > 0 && <p className="muted small">{ev.waitlistCount} on the waitlist</p>}
            {ev.capacity == null && <p className="muted small">No participant limit</p>}
          </div>
          {ev.myStatus === 'going' && <p className="note ok">You’re registered.{user?.telegramLinked ? ' We’ll remind you in Telegram 24 h and 1 h before.' : <> <Link to="/settings">Connect Telegram</Link> to get reminders.</>}</p>}
          {ev.myStatus === 'waitlist' && <p className="note warn">You are #{ev.waitlistPosition} on the waitlist. If someone cancels, you get the place automatically{user?.telegramLinked ? ' and a Telegram message' : ''}.</p>}
          <RegisterButton ev={ev} onChange={load} size="btn-block" />
          <div className="side-actions">
            <a className="btn btn-ghost btn-sm" href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer">Google Calendar</a>
            <a className="btn btn-ghost btn-sm" href={`/api/events/${ev.id}/ics`}>.ics file</a>
            <button className="btn btn-ghost btn-sm" onClick={share}>Copy link</button>
          </div>
          {ev.canManage && (
            <div className="side-actions manage">
              <Link className="btn btn-sm" to={`/organizer/events/${ev.id}/edit`}>Edit</Link>
              <Link className="btn btn-sm" to={`/organizer/events/${ev.id}/participants`}>Participants</Link>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
