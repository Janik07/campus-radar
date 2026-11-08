// US-03 event page, US-06/07 registration, US-09 calendar, US-14 ticket with QR
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession, useToast } from '../session.jsx';
import { CategoryTag, RegisterButton, StatusBadge, Spinner, Empty, Icon, Faces, thumb } from '../components.jsx';
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
    try { await navigator.clipboard.writeText(url); toast('Link copied — send it to a friend'); } catch { toast(url); }
  };

  return (
    <article className="event-page">
      <Link to="/" className="back">← All events</Link>
      <div className="ep-hero">
        <img src={thumb(ev.imageUrl, 1600)} alt="" />
        <div className="ep-hero-text">
          <div className="ep-tags"><CategoryTag category={ev.category} /><StatusBadge ev={ev} /></div>
          <h1>{ev.title}</h1>
          <p>by <Link to={`/clubs/${ev.club.slug}`}>{ev.club.name}</Link></p>
        </div>
      </div>

      <div className="ep-grid">
        <div className="ep-main">
          <dl className="facts">
            <div><span className="ico" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="calendar" /></span>
              <span><dt>When</dt><dd>{longDate(ev.startsAt)}<br /><span className="mono">{timeOf(ev.startsAt)}{ev.endsAt && `–${timeOf(ev.endsAt)}`}</span></dd></span></div>
            <div><span className="ico" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><Icon name="pin" /></span>
              <span><dt>Where</dt><dd>{ev.location}</dd></span></div>
            <div><span className="ico" style={{ background: 'var(--sun-soft)', color: 'var(--warn)' }}><Icon name="users" /></span>
              <span><dt>Organiser</dt><dd>{ev.club.name}{ev.club.telegramUrl && <> · <a href={ev.club.telegramUrl} target="_blank" rel="noreferrer">Telegram</a></>}</dd></span></div>
          </dl>
          {ev.description && <div className="ep-desc">{ev.description.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>}
          {ev.goingCount > 0 && <p className="muted"><Faces count={ev.goingCount} /> {ev.waitlistCount > 0 && <>· {ev.waitlistCount} on the waitlist</>}</p>}
        </div>

        <aside className="card ep-side">
          <div className="seats">
            <p className="seats-num"><b>{ev.goingCount}</b>{ev.capacity != null ? ` / ${ev.capacity} places taken` : ' going'}</p>
            {pct != null && <div className="meter" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>}
            {ev.capacity == null && <p className="muted small">No participant limit — everyone is welcome</p>}
            {ev.capacity != null && ev.spotsLeft > 0 && <p className="muted small">{ev.spotsLeft} places left</p>}
          </div>

          {ev.myStatus === 'going' && ev.ticket && (
            <div className={`ticket ${ev.ticket.checkedInAt ? 'checked' : ''}`}>
              <img src={`/api/events/${ev.id}/ticket.svg`} alt="QR ticket" />
              <div>
                <h3>{ev.ticket.checkedInAt ? 'Checked in' : 'Your ticket'}</h3>
                <p className="code">{ev.ticket.code}</p>
                <p className="muted small">{ev.ticket.checkedInAt ? 'Enjoy the event!' : 'Show the QR at the entrance or tell the organiser this code.'}</p>
              </div>
            </div>
          )}
          {ev.myStatus === 'going' && <p className="note ok">You’re registered.{user?.telegramLinked ? ' We’ll remind you in Telegram 24 h and 1 h before.' : <> <Link to="/settings">Connect Telegram</Link> to get reminders.</>}</p>}
          {ev.myStatus === 'waitlist' && <p className="note warn">You are #{ev.waitlistPosition} on the waitlist. If someone cancels, you get the place automatically{user?.telegramLinked ? ' and a Telegram message' : ''}.</p>}
          <RegisterButton ev={ev} onChange={load} size="btn-block" />
          <div className="side-actions">
            <a className="btn btn-sm" href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer"><Icon name="calendar" size={15} />Google Calendar</a>
            <a className="btn btn-sm" href={`/api/events/${ev.id}/ics`}>.ics</a>
            <button className="btn btn-sm" onClick={share}><Icon name="send" size={15} />Share</button>
          </div>
          {ev.canManage && (
            <div className="side-actions manage">
              <Link className="btn btn-sm btn-soft" to={`/organizer/events/${ev.id}/participants`}><Icon name="qr" size={15} />Check-in & participants</Link>
              <Link className="btn btn-sm" to={`/organizer/events/${ev.id}/edit`}>Edit</Link>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
